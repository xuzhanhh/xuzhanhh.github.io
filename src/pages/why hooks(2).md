---
title: why hooks(2) — useEffect是怎么跑起来的
date: '2019-03-22'
spoiler: 从hooks切入，深入了解React编程模型
---

##  前言

​		在[上一篇文章](https://xuzhanhh.com/why%20hooks/)中，我们梳理了useState的实现逻辑，得出是如果不考虑额外的优化逻辑，useState与fiber节点唯一的联系就是hooks队列是挂在fiber上的memoizedState，当React执行到当前函数式组件时会将其按序取出并更新。那么这一次我们来到了useEffect，这次的hook是与react-reconciler有很强的联系的，所以我们可以通过这个hooks打开react-reconciler的大门。

## mountEffect & mountLayoutEffect

同样地，根据触发时间不同useEffect也分为两个func-mountEffect和updateEffect

```typescript
function mountEffect(
  create: () => (() => void) | void,  //副作用func
  deps: Array<mixed> | void | null,  //记忆化 用于什么时候触发
): void {
  return mountEffectImpl(
    UpdateEffect | PassiveEffect, // fiberEffectTag
    UnmountPassive | MountPassive, // hookEffectTag
    create,
    deps,
  );
}

function mountLayoutEffect(
  create: () => (() => void) | void,
  deps: Array<mixed> | void | null,
): void {
  return mountEffectImpl(
    UpdateEffect,  //这里不同哦 不传passiveEffect
    UnmountMutation | MountLayout,
    create,
    deps,
  );
}
```

​		通过代码可以看到mountEffect与mountLayoutEffect唯一的差别就是传入的fiberEffectTag和hookEffectTag不同，当然，这两个hook具体的差别可以看[传送门](https://reactjs.org/docs/hooks-reference.html#uselayouteffect)。

​	这边简单介绍下`useEffect`触发的时机是React commit完毕后异步执行，`useLayoutEffect`是React commit完毕后同步执行，如果在useLayoutEffect代码太重的话可能会导致线程阻塞，而useEffect则不会阻塞，因为他会在浏览器idle时间执行。这点我们会在后面的代码体现。

​	我们先抛开useLayoutEffect只看useEffect的逻辑：

```typescript
function mountEffectImpl(fiberEffectTag, hookEffectTag, create, deps): void {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  // 在renderWithHooks中 currentlyRenderingFiber.effectTag|= sideEffectTag 付给当前fiber节点
  sideEffectTag |= fiberEffectTag;   
  // 创建effect
  hook.memoizedState = pushEffect(hookEffectTag, create, undefined, nextDeps);
}
```

```typescript
export type FunctionComponentUpdateQueue = {
  lastEffect: Effect | null,
};

function pushEffect(tag, create, destroy, deps) {
  const effect: Effect = {
    tag,
    create,
    destroy,
    deps,
    // 似拟 自圆
    next: (null: any),
  };
  if (componentUpdateQueue === null) {
    componentUpdateQueue = createFunctionComponentUpdateQueue(); //这个结构很简单的，看上面的type
    componentUpdateQueue.lastEffect = effect.next = effect; // 如果只有他一个 自圆
  } else {
    const lastEffect = componentUpdateQueue.lastEffect; //这里的逻辑和useState的相同哦
    if (lastEffect === null) {
      componentUpdateQueue.lastEffect = effect.next = effect;
    } else {
      const firstEffect = lastEffect.next;
      lastEffect.next = effect;
      effect.next = firstEffect;
      componentUpdateQueue.lastEffect = effect;
    }
  }
  //在memoizedState中仅作记录数据用
  return effect;
}
```



## updateEffect

​	updateEffect的大体逻辑与mountEffect相同，主要是添加了pushEffect时从prevEffect取出了destroy函数并传入到pushEffect中，且进行依赖检查，如果相同则在hookEffect选择NoHookEffect，不更新memoizedState和不更新sideEffectTag三点。

```typescript
// 这个func和mountEffect没什么差别
function updateEffect(
  create: () => (() => void) | void,
  deps: Array<mixed> | void | null,
): void {
  return updateEffectImpl(
    UpdateEffect | PassiveEffect,
    UnmountPassive | MountPassive,
    create,
    deps,
  );
}
```



```typescript
function updateEffectImpl(fiberEffectTag, hookEffectTag, create, deps): void {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  let destroy = undefined;
// 如果当前hook有数据，即更新状态
  if (currentHook !== null) {
    const prevEffect = currentHook.memoizedState;
     // 从上一次调用完sideEffect后的返回值取出destroy
    destroy = prevEffect.destroy;
    
    if (nextDeps !== null) {
      const prevDeps = prevEffect.deps;
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        // 如果依赖不为空且两次依赖校验相同，则执行上面所说的三点
        pushEffect(NoHookEffect, create, destroy, nextDeps);
        return;
      }
    }
  }

  sideEffectTag |= fiberEffectTag;
  hook.memoizedState = pushEffect(hookEffectTag, create, destroy, nextDeps);
}
```

至此，useEffect在ReactFiberHooks.js里的逻辑已经没有了，剩下我们将跑入react-reconciler中。观察useEffect剩下的逻辑是怎么执行的。

## render阶段

class组件的具体流程可以看我这篇[blog](https://xuzhanhh.com/Inside%20Fiber/)，下面开始分析functional组件，我会将设计一个分界点在renderWithHooks，这样我认为流程看起来会更加清晰

### 在renderWithHooks之前

#### renderRoot & workloop

reconcile通常从`HostRoot`fiber结点，并通过[renderRoot](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactFiberScheduler.js#L1132)方法开始。但是，React会快速跳过已经处理过的fiber节点知道他找到一个未完成工作的结点。举个🌰，如果你在组件树的深层调用`setState`，React仍然会从Root节点开始reconcile不过会快速跳过节点直到遇到调用setState的组件。在renderRoot中，所有的fiber节点都会在[workloop](https://github.com/facebook/react/blob/f765f022534958bcf49120bf23bc1aa665e8f651/packages/react-reconciler/src/ReactFiberScheduler.js#L1136)中被处理。在本篇blog中，我们默认使用同步模式。

```javascript
function workLoop(isYieldy) {
  if (!isYieldy) {
    // Flush work without yielding
    while (nextUnitOfWork !== null) {
      nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    }
  } else {
  }
}
```

`nextUnitOfWork`会保留对`workInProgress`tree中需要处理的fiber节点的引用。当React遍历fiber tree时，会用这个变量去知晓这里是否有其他未完成工作的fiber结点。

这里会有四个主要函数用于遍历fiber树及发起、完成工作：

- [performUnitOfWork](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactFiberScheduler.js#L1056)
- [beginWork](https://github.com/facebook/react/blob/cbbc2b6c4d0d8519145560bd8183ecde55168b12/packages/react-reconciler/src/ReactFiberBeginWork.js#L1489)
- [completeUnitOfWork](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactFiberScheduler.js#L879)
- [completeWork](https://github.com/facebook/react/blob/cbbc2b6c4d0d8519145560bd8183ecde55168b12/packages/react-reconciler/src/ReactFiberCompleteWork.js#L532)

让我们通过下面这个简化了的gif演示他们是怎么运行的，每一个函数需要一个fiber节点作为入参。当React遍历fiber树时可以清楚地看到当前fiber节点的变动，在处理父亲节点前会先会完成孩子节点。这个图动的很快，建议仔细一步步看。

>同一列是兄弟节点，向右的是孩子节点

![img](/images/1*A3-yF-3Xf47nPamFpRm64w.png)



#### performUnitOfWork & beginWork

**performUnitOfWork**接收一个从**workInProgress tree**中的fiber节点，然后调用**beginWork**，beginWork是触发fiber节点更新的地方。

```javascript
function performUnitOfWork(workInProgress) {
    let next = beginWork(workInProgress);
    if (next === null) {
        next = completeUnitOfWork(workInProgress);
    }
    return next;
}

```

在beginWork中，主要逻辑分为判断该fiber的props和context有否发生变化，如果发生变化则标记didReceiveUpdate为true，且判断是否需要更新，如果没有更新则return。没有return则进入更新组件阶段。

```javascript
// 这里分析函数式组件的beginWork, current->当前渲染使用的fiber，workInProgress->这次更新用的fiber
function beginWork(current, workInProgress, renderExpirationTime) {
  const updateExpirationTime = workInProgress.expirationTime; // 还剩多少时间
  if (current !== null) {
    const oldProps = current.memoizedProps;
    const newProps = workInProgress.pendingProps;
    if (oldProps !== newProps || hasLegacyContextChanged()) {
      //如果props或者context变化，则标记该fiber节点在之前已经更新过
      //在memo的且memorize相同的情况下不设置
      didReceiveUpdate = true;
    } else if (updateExpirationTime < renderExpirationTime) {
      didReceiveUpdate = false;
      // 这个fiber节点没活干，所以直接跳出即可，但是在跳出前还有一些优化逻辑要处理，e.g.往栈上放必须的数据
      // ...这里我们暂时不关心
      return bailoutOnAlreadyFinishedWork(
        current,
        workInProgress,
        renderExpirationTime,
      );
    }
  } else {
    //如果上一个状态没有fiber节点
    didReceiveUpdate = false;
  }
  //清空呼气时间
  workInProgress.expirationTime = NoWork;
  switch (workInProgress.tag) {
    case FunctionComponent: {
      const Component = workInProgress.type;
      const unresolvedProps = workInProgress.pendingProps;
      const resolvedProps =
        workInProgress.elementType === Component
          ? unresolvedProps
          : resolveDefaultProps(Component, unresolvedProps);
      return updateFunctionComponent(
        current,
        workInProgress,
        Component,
        resolvedProps,
        renderExpirationTime,
      );
    }

  }
  return workInProgress.child;
}
```

#### updateFunctionComponent

```typescript
function updateFunctionComponent(
  current,
  workInProgress,
  Component,
  nextProps: any,
  renderExpirationTime,
) {

  const unmaskedContext = getUnmaskedContext(workInProgress, Component, true);
  const context = getMaskedContext(workInProgress, unmaskedContext);

  let nextChildren;
  prepareToReadContext(workInProgress, renderExpirationTime);

  nextChildren = renderWithHooks(
    current,
    workInProgress,
    Component,
    nextProps,
    context,
    renderExpirationTime,
  );
// 如果上一个状态有fiber节点且没有接受到更新 如果调用了setState则会在updateReducer中
// 调用markWorkInProgressReceivedUpdate将didReceiveUpdate置为true
  if (current !== null && !didReceiveUpdate) {
    // 因为要跳出这个组件的render阶段，所以清空hooks，重置workInProgress中的数据
    bailoutHooks(current, workInProgress, renderExpirationTime);
    return bailoutOnAlreadyFinishedWork(
      current,
      workInProgress,
      renderExpirationTime,
    );
  }
  reconcileChildren(
    current,
    workInProgress,
    nextChildren,
    renderExpirationTime,
  );
  return workInProgress.child;
}
```



### 在renderWithHooks之后

```typescript
export function bailoutHooks(
  current: Fiber,
  workInProgress: Fiber,
  expirationTime: ExpirationTime,
) {
  // 复用updateQueue   
  workInProgress.updateQueue = current.updateQueue;
  // 移除两个tag
  workInProgress.effectTag &= ~(PassiveEffect | UpdateEffect);
  if (current.expirationTime <= expirationTime) {
    //移除呼气时间
    current.expirationTime = NoWork;
  }
}
```



## commit阶段

