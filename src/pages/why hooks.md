---
title: why hooks（一）
date: '2019-03-17'
spoiler: 从hooks切入，深入了解React编程模型
---

## 前言

​	简单说下为什么React选择函数式组件，主要是class组件比较冗余、生命周期函数写法不友好，骚写法多，functional组件更符合React编程思想等等等。更具体的可以拜读dan大神的blog:[传送门](https://overreacted.io/how-are-function-components-different-from-classes/)。其中**Function components capture the rendered values**这句十分精辟的道出函数式组件的优势。

​	但是在16.7之前react的函数式组件十分羸弱，基本只能作用于纯展示组件，主要因为缺少state和生命周期。本人曾经在hooks出来前负责过纯函数式的react项目，所有状态处理都必须在reducer中进行，所有副作用都在saga中执行，可以说是十分艰辛的经历了。在hooks出来后我在公司的一个小中台项目中使用，落地效果不错，代码量显著减少的同时提升了代码的可读性。因为通过custom hooks可以更好地剥离代码结构，不会像以前类组件那样在cDU等生命周期堆了一大堆逻辑，在命令式代码和声明式代码中有一个良性的边界。

## useState在React中是怎么实现的

> Hooks take some getting used to — and especially at the boundary of imperative and declarative code.

​	如果对hooks不太了解的可以先看看这篇文章:[前情提要](https://medium.com/@ryardley/react-hooks-not-magic-just-arrays-cd4f1857236e)，对hooks实现有个具体了解。这篇文章很清晰的介绍了hooks的原理，但是仅停留最基本的useState。不过我对useEffect，useRef等钩子的实现比较好奇，所以开始啃起了源码，下面我会结合源码介绍useState的原理。

### hook的结构

首先的是hooks的结构，hooks是挂载在组件Fiber结点上me的

```javascript
//hook的结构
export type Hook = {
  memoizedState: any, //上一次的state
  baseState: any,  //当前state
  baseUpdate: Update<any, any> | null,
  queue: UpdateQueue<any, any> | null,  //用于缓存多次action
  next: Hook | null, //链表
};
```

```javascript
function mountState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  const hook = mountWorkInProgressHook();
//如果入参是func则会调用，但是不提供参数，带参数的需要包一层
  if (typeof initialState === 'function') {
    initialState = initialState();
  }
//记忆化state和基本state都初始化
  hook.memoizedState = hook.baseState = initialState;
  const queue = (hook.queue = {
    last: null,
    dispatch: null,
    eagerReducer: basicStateReducer, // useState使用基础reducer
    eagerState: (initialState: any),
  });
//返回触发器
  const dispatch: Dispatch<
    BasicStateAction<S>,
  > = (queue.dispatch = (dispatchAction.bind(
    null,
    // Flow doesn't know this is non-null, but we do.
    ((currentlyRenderingFiber: any): Fiber),
    queue,
  ): any));
  return [hook.memoizedState, dispatch];
}
```

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

