---
title: why hooks（一）
date: '2019-03-17'
spoiler: 从hooks切入，深入了解React编程模型
---

## 前言

​	简单说下为什么React选择函数式组件，主要是class组件比较冗余、生命周期函数写法不友好，骚写法多，functional组件更符合React编程思想等等等。更具体的可以拜读dan大神的blog:[传送门](https://overreacted.io/how-are-function-components-different-from-classes/)。其中**Function components capture the rendered values**这句十分精辟的道出函数式组件的优势。

​	但是在16.8之前react的函数式组件十分羸弱，基本只能作用于纯展示组件，主要因为缺少state和生命周期。本人曾经在hooks出来前负责过纯函数式的react项目，所有状态处理都必须在reducer中进行，所有副作用都在saga中执行，可以说是十分艰辛的经历了。在hooks出来后我在公司的一个小中台项目中使用，落地效果不错，代码量显著减少的同时提升了代码的可读性。因为通过custom hooks可以更好地剥离代码结构，不会像以前类组件那样在cDU等生命周期堆了一大堆逻辑，在命令式代码和声明式代码中有一个良性的边界。

## useState在React中是怎么实现的

> Hooks take some getting used to — and especially at the boundary of imperative and declarative code.

​	如果对hooks不太了解的可以先看看这篇文章:[前情提要](https://medium.com/@ryardley/react-hooks-not-magic-just-arrays-cd4f1857236e)，十分简明的介绍了hooks的核心原理，但是我对useEffect，useRef等钩子的实现比较好奇，所以开始啃起了源码，下面我会结合源码介绍useState的原理。useState具体逻辑分成三部分：mountState，dispatch， updateState

### hook的结构

首先的是hooks的结构，hooks是挂载在组件Fiber结点上memoizedState的，关于Fiber结点可以看看我的另一篇：[传送门](https://xuzhanhh.com/Inside%20Fiber/)

```javascript
//hook的结构
export type Hook = {
  memoizedState: any, //上一次的state
  baseState: any,  //当前state
  baseUpdate: Update<any, any> | null,  // update func
  queue: UpdateQueue<any, any> | null,  //用于缓存多次action
  next: Hook | null, //链表
};
```

### renderWithHooks

在reconciler中处理函数式组件的函数是renderWithHooks，其类型是：

```javascript
renderWithHooks(
  current: Fiber | null, //当前的fiber结点
  workInProgress: Fiber, 
  Component: any, //jsx中用<>调用的函数
  props: any,
  refOrContext: any,
  nextRenderExpirationTime: ExpirationTime, //需要在什么时候结束
): any
```

在renderWithHooks，核心流程如下：

```javascript
//从memoizedState中取出hooks
nextCurrentHook = current !== null ? current.memoizedState : null; 
//判断通过有没有hooks判断是mount还是update，两者的函数不同
ReactCurrentDispatcher.current =
      nextCurrentHook === null
        ? HooksDispatcherOnMount
        : HooksDispatcherOnUpdate;
//执行传入的type函数
let children = Component(props, refOrContext);
//执行完函数后的dispatcher变成只能调用context的
ReactCurrentDispatcher.current = ContextOnlyDispatcher;

return children;
```

### useState构建时流程

#### mountState

在HooksDispatcherOnMount中，useState调用的是下面的mountState，作用是创建一个新的hook并使用默认值初始化并绑定其触发器，因为useState底层是useReducer，所以数组第二个值返回的是dispatch。

```typescript
type BasicStateAction<S> = (S => S) | S;

function mountState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  const hook = mountWorkInProgressHook();
//如果入参是func则会调用，但是不提供参数，带参数的需要包一层
  if (typeof initialState === 'function') {
    initialState = initialState();
  }
//上一个state和基本(当前)state都初始化
  hook.memoizedState = hook.baseState = initialState;
  const queue = (hook.queue = {
    last: null,
    dispatch: null,
    eagerReducer: basicStateReducer, // useState使用基础reducer
    eagerState: (initialState: any),
  });
//返回触发器
  const dispatch: Dispatch<
    //useState底层是useReducer，所以type是BasicStateAction
    BasicStateAction<S>,
  > = (queue.dispatch = (dispatchAction.bind(
    null,
    //绑定当前fiber结点和queue
    ((currentlyRenderingFiber: any): Fiber),
    queue,
  ): any));
  return [hook.memoizedState, dispatch];
}
```

#### mountWorkInProgressHook

这个函数是mountState时调用的构建hook的方法，在初始化完毕后会连接到当前hook.next（如果有的话）

```javascript
function mountWorkInProgressHook(): Hook {
  const hook: Hook = {
    memoizedState: null,
    baseState: null,
    queue: null,
    baseUpdate: null,
    next: null,
  };
  if (workInProgressHook === null) {
    // 列表中的第一个hook
    firstWorkInProgressHook = workInProgressHook = hook;
  } else {
    // 添加到列表的末尾
    workInProgressHook = workInProgressHook.next = hook;
  }
  return workInProgressHook;
}
```

### dispatch分发函数

​	在上面我们提到，useState底层是useReducer，所以返回的第二个参数是dispatch函数，其中的设计十分巧妙。

假设我们有以下代码:

```javascript
const [data, setData] = React.useState(0)
setData('first')
setData('second')
setData('third')
```

![image-20190317151730512](/images/image-20190317151730512.png)

在第一次setData后， hooks的结构如上图

![image-20190317152006773](/images/image-20190317152006773.png)

在第二次setData后， hooks的结构如上图

![image-20190317152401946](/images/image-20190317152401946.png)

在第三次setData后， hooks的结构如上图

![image-20190318114449227](/images/image-20190318114449227.png)

在正常情况下，是不会在dispatcher中触发reducer而是将action存入update中在updateState中再执行，但是如果在react没有重渲染需求的前提下是会提前计算state即eagerState。作为性能优化的一环。

```typescript
function dispatchAction<S, A>(
  fiber: Fiber,
  queue: UpdateQueue<S, A>,
  action: A,
) {
  const alternate = fiber.alternate;
   {
    flushPassiveEffects();
	//获取当前时间并计算可用时间
    const currentTime = requestCurrentTime();
    const expirationTime = computeExpirationForFiber(currentTime, fiber);

    const update: Update<S, A> = {
      expirationTime,
      action,
      eagerReducer: null,
      eagerState: null,
      next: null,
    };
	//下面的代码就是为了构建queue.last是最新的更新，然后last.next开始是每一次的action
    // 取出last
    const last = queue.last;
    if (last === null) {
      // 自圆
      update.next = update;
    } else {
      const first = last.next;
      if (first !== null) {
        
        update.next = first;
      }
      last.next = update;
    }
    queue.last = update;

    if (
      fiber.expirationTime === NoWork &&
      (alternate === null || alternate.expirationTime === NoWork)
    ) {
      // 当前队列为空，我们可以在进入render阶段前提前计算出下一个状态。如果新的状态和当前状态相同，则可以退出重渲染
      const lastRenderedReducer = queue.lastRenderedReducer; // 上次更新完后的reducer
      if (lastRenderedReducer !== null) {
        let prevDispatcher;
        if (__DEV__) {
          prevDispatcher = ReactCurrentDispatcher.current;  // 暂存dispatcher
          ReactCurrentDispatcher.current = InvalidNestedHooksDispatcherOnUpdateInDEV;
        }
        try {
          const currentState: S = (queue.lastRenderedState: any);
          // 计算下次state
          const eagerState = lastRenderedReducer(currentState, action);
          // 在update对象中存储预计算的完整状态和reducer，如果在进入render阶段前reducer没有变化那么可以服用eagerState而不用重新再次调用reducer
          update.eagerReducer = lastRenderedReducer;
          update.eagerState = eagerState;
          if (is(eagerState, currentState)) {
            // 在后续的时间中，如果这个组件因别的原因被重渲染且在那时reducer更变后，仍有可能重建这次更新
            return;
          }
        } catch (error) {
          // Suppress the error. It will throw again in the render phase.
        } finally {
          if (__DEV__) {
            ReactCurrentDispatcher.current = prevDispatcher;
          }
        }
      }
    }
    scheduleWork(fiber, expirationTime);
  }
}
```



### useState更新时流程

#### updateReducer

​	因为useState底层是useReducer，所以在更新时的流程(即重渲染组件后)是调用updateReducer的。

```typescript
function updateState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  return updateReducer(basicStateReducer, (initialState: any));
}
```

​	所以其reducer十分简单

```typescript
function basicStateReducer<S>(state: S, action: BasicStateAction<S>): S {
  return typeof action === 'function' ? action(state) : action;
}
```

​	我们先把复杂情况抛开，跑通updateReducer流程

```typescript
function updateReducer<S, I, A>(
  reducer: (S, A) => S,
  initialArg: I,
  init?: I => S,
): [S, Dispatch<A>] {
  // 获取当前hook,queue
  const hook = updateWorkInProgressHook();
  const queue = hook.queue;

  queue.lastRenderedReducer = reducer;

  // action队列的最后一个更新
  const last = queue.last;
  // 最后一个更新是基本状态
  const baseUpdate = hook.baseUpdate;
  const baseState = hook.baseState;

  // 找到第一个没处理的更新
  let first;
  if (baseUpdate !== null) {
    if (last !== null) {
      // 第一次更新时，队列是一个自圆queue.last.next = queue.first。当第一次update提交后，baseUpdate不再为空即可跳出队列
      last.next = null;
    }
    first = baseUpdate.next;
  } else {
    first = last !== null ? last.next : null;
  }
  if (first !== null) {
    let newState = baseState;
    let newBaseState = null;
    let newBaseUpdate = null;
    let prevUpdate = baseUpdate;
    let update = first;
    let didSkip = false;
    do {
      const updateExpirationTime = update.expirationTime;
      if (updateExpirationTime < renderExpirationTime) {
        // 优先级不足，跳过这次更新，如果这是第一次跳过更新，上一个update/state是newBaseupdate/state
        if (!didSkip) {
          didSkip = true;
          newBaseUpdate = prevUpdate;
          newBaseState = newState;
        }
        // 更新优先级
        if (updateExpirationTime > remainingExpirationTime) {
          remainingExpirationTime = updateExpirationTime;
        }
      } else {
        // 处理更新
        if (update.eagerReducer === reducer) {
          // 如果更新被提前处理了且reducer跟当前reducer匹配，可以复用eagerState
          newState = ((update.eagerState: any): S);
        } else {
          // 循环调用reducer
          const action = update.action;
          newState = reducer(newState, action);
        }
      }
      prevUpdate = update;
      update = update.next;
    } while (update !== null && update !== first);

    if (!didSkip) {
      newBaseUpdate = prevUpdate;
      newBaseState = newState;
    }

    // 只有在前后state变了才会标记
    if (!is(newState, hook.memoizedState)) {
      markWorkInProgressReceivedUpdate();
    }
    hook.memoizedState = newState;
    hook.baseUpdate = newBaseUpdate;
    hook.baseState = newBaseState;
    queue.lastRenderedState = newState;
  }

  const dispatch: Dispatch<A> = (queue.dispatch: any);
  return [hook.memoizedState, dispatch];
}
```



```javascript
export function markWorkInProgressReceivedUpdate() {
  didReceiveUpdate = true;
}
```



## 后记

​	作为系列的第一篇文章，我选择了最常用的hooks开始，抛开提前计算及与react-reconciler的互动，整个流程是十分清晰易懂的。mount的时候构建钩子，触发dispatch时按序插入update。updateState的时候再按序触发reducer。可以说就是一个简单的redux。但是作为系列的开篇我认为知识量已经达到要求了xd