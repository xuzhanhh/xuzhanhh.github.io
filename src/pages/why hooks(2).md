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



## 跳出hooks

至此，useEffect在ReactFiberHooks.js里的逻辑已经没有了，剩下我们将跑入react-reconciler中。观察useEffect剩下的逻辑是怎么执行的。