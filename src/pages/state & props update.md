---
title: state & props update
date: '2018-12-22'
spoiler: 深入react内部
---

Demo:

https://stackblitz.com/edit/react-jwqn64

```jsx
class ClickCounter extends React.Component {
    constructor(props) {
        super(props);
        this.state = {count: 0};
        this.handleClick = this.handleClick.bind(this);
    }

    handleClick() {
        this.setState((state) => {
            return {count: state.count + 1};
        });
    }
    
    componentDidUpdate() {}

    render() {
        return [
            <button key="1" onClick={this.handleClick}>Update counter</button>,
            <span key="2">{this.state.count}</span>
        ]
    }
}
```

当我们点击button时，我们可以看到[**completeWork**](https://github.com/facebook/react/blob/cbbc2b6c4d0d8519145560bd8183ecde55168b12/packages/react-reconciler/src/ReactFiberCompleteWork.js#L532)：

* 更新`ClickCounter`中的count state
* 调用`render`方法去得到children列表并执行比较
* 更新`span`元素的props

在[**commitRoot**](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactFiberScheduler.js#L523)：

* 更新`span`元素的`textContent`属性
* 调用`cDU`

### Scheduling updates（安排更新）

​	当我们点击按钮，会触发点击事件然后react解析我们传给按钮props的callback。在这个应用中callback是增加counter并更新state。

```jsx
class ClickCounter extends React.Component {
    //...
    handleClick() {
        this.setState((state) => {
            return {count: state.count + 1};
        });
    }
}   
```

​		每一个React组件都有一个`updater`作为组件和react核心通信的桥梁。他允许`setState`在不同的环境下（ReactDOM，RN， SSR， test）实现不同的效果

> 注：关于updater，可以关联学习dan大神博客的[How Does setState Know What to Do?]( https://overreacted.io/how-does-setstate-know-what-to-do/) 

​	在这篇文章中，我们会侧重ReactDom的使用了Fiber reconciler的updater实现，对于`ClickCounter`组件是[**classComponentUpdater**](https://github.com/facebook/react/blob/6938dcaacbffb901df27782b7821836961a5b68d/packages/react-reconciler/src/ReactFiberClassComponent.js#L186)，他负责检索fiber实例，队列更新和安排工作。

​	当更新排队时，他们基本上只是被添加到fiber节点上处理的更新队列中。在我们的实例中，与ClickCounter组件对应的fiber节点有以下的结构

```javascript
{
    stateNode: new ClickCounter,
    type: ClickCounter,
    updateQueue: {
         baseState: {count: 0}
         firstUpdate: {
             next: {
                 payload: (state) => { return {count: state.count + 1} }
             }
         },
         ...
     },
     ...
}
```

我们可以看到，`updateQueue.firstUpdate.next.payload`中的函数是我们传给`ClickCounter`组件中setState的callback。他表示在render阶段需要被处理的第一个更新。

### 处理ClickCounter Fiber结点的更新

​	我们已经有一个ClickCounter实例，所以我们进入[**updateClassInstance**](https://github.com/facebook/react/blob/6938dcaacbffb901df27782b7821836961a5b68d/packages/react-reconciler/src/ReactFiberClassComponent.js#L976)函数，这里是react对class组件执行最多操作的函数。以下是按执行顺序在函数中执行的最重要的操作：

* 调用**UNSAFE_componentWillReceiveProps**钩子（在react v17中弃用）
* 执行**updateQueue**中的更新并生成新的state
* 用新的state调用**getDerivedStateFromProps**并得到结果
* 调用**sCU**确定一个组件是否需要更新，如果**false**，跳过整个渲染过程
* 调用**UNSAFE_componentWillUpdate**钩子（在react v17中弃用）
* 添加一个effect去触发**componentDidUpdate**钩子

> **cDU**这个effect在**render**阶段中被添加，但是在**commit**中执行

* 更新组件实例的**state**和**props**

函数简化后如下：

```javascript
function updateClassInstance(current, workInProgress, ctor, newProps, ...) {
    const instance = workInProgress.stateNode;

    const oldProps = workInProgress.memoizedProps;
    instance.props = oldProps;
    if (oldProps !== newProps) {
        callComponentWillReceiveProps(workInProgress, instance, newProps, ...);
    }

    let updateQueue = workInProgress.updateQueue;
    if (updateQueue !== null) {
        processUpdateQueue(workInProgress, updateQueue, ...);
        newState = workInProgress.memoizedState;
    }

    applyDerivedStateFromProps(workInProgress, ...);
    newState = workInProgress.memoizedState;

    const shouldUpdate = checkShouldComponentUpdate(workInProgress, ctor, ...);
    if (shouldUpdate) {
        instance.componentWillUpdate(newProps, newState, nextContext);
        workInProgress.effectTag |= Update;
        workInProgress.effectTag |= Snapshot;
    }

    instance.props = newProps;
    instance.state = newState;

    return shouldUpdate;
}
```

上面的代码片段移除了一些辅助代码。例如，在调用生命周期方法或添加effect来触发它们时，react会用**typeof**检查一个组件是否实现了这些方法。下面是react在添加effect前检查**cDU**方法

```javascript
if (typeof instance.componentDidUpdate === 'function') {
    workInProgress.effectTag |= Update;
}
```

好的，现在我们知道在render阶段**ClickCounter**会执行什么操作，现在让我们看看这些操作是怎么改变fiber节点的值。当react开始工作前，**ClickCounter**的fiber节点：

```javascript
{
    effectTag: 0,
    elementType: class ClickCounter,
    firstEffect: null,
    memoizedState: {count: 0},
    type: class ClickCounter,
    stateNode: {
        state: {count: 0}
    },
    updateQueue: {
        baseState: {count: 0},
        firstUpdate: {
            next: {
                payload: (state, props) => {…}
            }
        },
        ...
    }
}
```

在工作完成后，fiber节点是这样的：

```javascript
{
    effectTag: 4,
    elementType: class ClickCounter,
    firstEffect: null,
    memoizedState: {count: 1},
    type: class ClickCounter,
    stateNode: {
        state: {count: 1}
    },
    updateQueue: {
        baseState: {count: 1},
        firstUpdate: null,
        ...
    }
}
```

在更新被执行后，**count**的值在**memoized**和**updateQueue**中的**baseState**变成了**1**。react也更新了**ClickCounter**组件实例中的state(stateNode)。

在这个时候，队列中已经没有更新了，所以**firstUpdate**是**null**。而且**effectTag**从0->4，二进制中是100，即第三位设了1，意义是 [side-effect tag](https://github.com/facebook/react/blob/b87aabdfe1b7461e7331abb3601d9e6bb27544bc/packages/shared/ReactSideEffectTags.js)中的**Update**:

```javascript
export const Update = 0b00000000100;
```

总结，当在处理ClickCounter fiber节点时，react调用更新前的生命周期，更新state和定义相应的side-effects。

### Reconciling children for the ClickCounter Fiber

下一步，react开始 [finishClassComponent](https://github.com/facebook/react/blob/340bfd9393e8173adca5380e6587e1ea1a23cefa/packages/react-reconciler/src/ReactFiberBeginWork.js#L355)，在这里react会调用react组件实例的**render**方法并在组件返回的的孩子上应用diff算法。更高阶的概述在这个[文档](https://reactjs.org/docs/reconciliation.html#the-diffing-algorithm)。

> 当比较两个相同类型的React DOM元素时，React查看两者的属性，保持相同的底层DOM节点，并仅更新更改的属性。

如果我们深入挖掘，我们会发现实际上是比较react元素的fiber节点，但我现在不会详细介绍，因为这个过程非常精细。我会写一篇单独的文章，特别关注child reconciliation。

> 如果您急于自己学习细节，查看[reconcileChildrenArray](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactChildFiber.js#L732)函数因为我们这个应用的render方法返回了一个react元素的数组。

