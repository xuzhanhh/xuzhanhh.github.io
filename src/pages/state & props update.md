---
title: state & props update
date: '2018-01-07'
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

## render阶段

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

我们需要理解两个重要的概念：

1. 当react执行child reconciliation时，他创建或更新render方法返回的reac元素的fiber节点。**finishClassComponent**函数返回当前fiber节点第一个孩子的引用。它会分配到**nextUnitOfWork**并在稍后的work loop中处理。

2. react更新children的props作为parent工作的一部分。为此，它使用来自render方法返回的React元素的数据。例如，这是**span**在react reconcile之前的fiber节点

   ```javascript
   {
       stateNode: new HTMLSpanElement,
       type: "span",
       key: "2",
       memoizedProps: {children: 0},
       pendingProps: {children: 0},
       ...
   }
   ```

   可以看到，**memoizedProps**和**pendingProps**中的**children**是**0**，这里是span元素被render后返回的react元素

   ```javascript
   {
       $$typeof: Symbol(react.element)
       key: "2"
       props: {children: 1}
       ref: null
       type: "span"
   }
   ```

   可以看到，fiber节点中的props和被返回的react元素有不同，在[**createWorkInProgress**](https://github.com/facebook/react/blob/769b1f270e1251d9dbdce0fcbd9e92e502d059b8/packages/react-reconciler/src/ReactFiber.js#L326)函数中创建alternate fiber节点，**react会从react元素中有更新的属性中复制到fiber节点**。所以，当react结束**ClickCouter**组件的child reconciliation，**span**的fiber节点会更新**pendingProps**属性。

   ```javascript
   {
       stateNode: new HTMLSpanElement,
       type: "span",
       key: "2",
       memoizedProps: {children: 0},
       pendingProps: {children: 1},
       ...
   }
   ```

   当react执行span fiber节点工作时，会将pendingProps复制到**memoizedProps**中并添加一个effects去更新DOM。

   

   这就是render阶段react在**ClickCounter** fiber节点上的工作。因为button是ClickCounter组件的第一个孩子，他会被分配到**nextUnitOfWork**，且他没什么卵事要干，所以react会移动到他的兄弟节点--span。





### Processing updates for the Span fiber

与**ClickCounter**相似，从[beginWork](https://github.com/facebook/react/blob/cbbc2b6c4d0d8519145560bd8183ecde55168b12/packages/react-reconciler/src/ReactFiberBeginWork.js#L1489)函数开始。因为**span**节点是**HostComponent**类型，所以：

````javascript
function beginWork(current$$1, workInProgress, ...) {
    ...
    switch (workInProgress.tag) {
        case FunctionalComponent: {...}
        case ClassComponent: {...}
        case HostComponent:
          return updateHostComponent(current, workInProgress, ...);
        case ...
}
````

在[updateHostComponent](https://github.com/facebook/react/blob/cbbc2b6c4d0d8519145560bd8183ecde55168b12/packages/react-reconciler/src/ReactFiberBeginWork.js#L686)结束。可以与class组件调用的**updateClassComponent**对比。对于函数式组件是**updateFunctionComponent**。你可以在[**ReactFiberBeginWork.js**](https://github.com/facebook/react/blob/1034e26fe5e42ba07492a736da7bdf5bf2108bc6/packages/react-reconciler/src/ReactFiberBeginWork.js)中找到所有这些函数。

### Reconciling children for the span fiber

在我们的例子中，span节点的**updateHostComponent**中没有特别重要的事情发生。

### Completing work for the Span Fiber node

当**beginWork**结束后，会进入**completeWork**。不过在这之前，react需要更新span fiber节点上的**memoizedProps**，你可能还记得当**ClickCounter**上reconciling children时，react更新了span fiber节点的**pendingProps**

```javascript
//这是之前的
{
    stateNode: new HTMLSpanElement,
    type: "span",
    key: "2",
    memoizedProps: {children: 0},
    pendingProps: {children: 1},
    ...
}
```

当**span**的fiber**beginWork**完成后，react更新pendingProps以匹配memoizedProps

```javascript
function performUnitOfWork(workInProgress) {
    ...
    next = beginWork(current$$1, workInProgress, nextRenderExpirationTime);
    workInProgress.memoizedProps = workInProgress.pendingProps;
    ...
}
```

然后它调用completeWork函数，它基本上是一个类似于我们在beginWork中看到的大转换语句

```javascript

function completeWork(current, workInProgress, ...) {
    ...
    switch (workInProgress.tag) {
        case FunctionComponent: {...}
        case ClassComponent: {...}
        case HostComponent: {
            ...
            updateHostComponent(current, workInProgress, ...);
        }
        case ...
    }
}
```

由于我们的span Fiber节点是HostComponent，因此它运行[**updateHostComponent**](https://github.com/facebook/react/blob/cbbc2b6c4d0d8519145560bd8183ecde55168b12/packages/react-reconciler/src/ReactFiberBeginWork.js#L686)函数。在这个函数中，React基本上执行以下操作：

* 准备DOM更新
* 将这些更新放到span fiber节点的updateQueue
* 将这些effect应用到更新DOM上

在执行这些操作之前，span Fiber节点如下所示：

```javascript
{
    stateNode: new HTMLSpanElement,
    type: "span",
    effectTag: 0
    updateQueue: null
    ...
}
```

当工作完成时，它看起来像这样：

```javascript
{
    stateNode: new HTMLSpanElement,
    type: "span",
    effectTag: 4,
    updateQueue: ["children", "1"],
    ...
}
```

​	注意effectTag和updateQueue字段的区别。它不再是0，它的值是4.在二进制中，这是100，这意味着第三位被设置，这是**update** side-effect的标志位。这是react需要在接下来的commit阶段对这个节点仅需的工作。**updateQueue**字段保存将用于更新的有效payload。 

​	当react处理完**ClickCounter**和他的孩子，render阶段就结束了。它现在可以将完成的alternate tree分配给FiberRoot上的finishedWork属性。这是需要刷新到屏幕的新树。它可以在渲染阶段后立即处理，也可以在浏览器给出React时间后再处理。

### Effects list

​	在我们的例子中，因为span节点和ClickCounter组件有side effects，react会将span的fiber节点连接到HostFiber的firstEffect属性。react会在[**compliteUnitOfWork**](https://github.com/facebook/react/blob/d5e1bf07d086e4fc1998653331adecddcd0f5274/packages/react-reconciler/src/ReactFiberScheduler.js#L999)函数构建effects list，以下是具有更新span节点和ClickCounter上的钩子效果的fiber tree：

![](http://pjpqjxkf6.bkt.clouddn.com/1_TRmFSeuOuWlY3HXh86cvDA.png)

## commit阶段

​	commit阶段是react更新DOM和调用cDU生命周期。为了实现，react会遍历render阶段构建的effects list并应用他们。

```javascript
{ type: ClickCounter, effectTag: 5 }
{ type: 'span', effectTag: 4 }
```

​	ClickCouter的effect tag是5（二进制是101），定义了**Update**，对于class组件来说基本上是转换**componentDidUpdate**，二进制的最后一位被设置意味着这个fiber节点在**render**阶段的所有工作已经完成。

​	span的effect tag是4（二进制100），定义了 update，对于host组件来说是DOM更新。在span元素的情况下，react会更新元素的**textContent**。

### Applying effects

​	让我们看看react是如何应用这些effects的，[**commitRoot**](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactFiberScheduler.js#L523)函数，包含了三个子函数：

```javascript
function commitRoot(root, finishedWork) {
    commitBeforeMutationLifecycles()
    commitAllHostEffects();
    root.current = finishedWork;
    commitAllLifeCycles();
}
```

 	每一个子函数都会遍历effecys list并检查effects的类型。当它找到与函数目的相关的效果时，它会应用它。在我们的例子中，commitRoot会调用**ClickCounter**的**cDU**和更新**span**元素的文本。

​	第一个函数[commitBeforeMutationLifeCycles](https://github.com/facebook/react/blob/fefa1269e2a67fa5ef0992d5cc1d6114b7948b7e/packages/react-reconciler/src/ReactFiberCommitWork.js#L183)会查找[**Snapshot**](https://github.com/facebook/react/blob/b87aabdfe1b7461e7331abb3601d9e6bb27544bc/packages/shared/ReactSideEffectTags.js#L25) effect并调用**getSnapshotBeforeUpdate**方法。不过我们的**ClickCouter**组件没有实现这个方法，react不会在**render**阶段中添加这个effect，所以在我们的例子中，这个函数不起作用。

### DOM updates

​	下一步，react会执行[**commitAllHostEffects**](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactFiberScheduler.js#L376)函数，在这个函数中React会将**span**元素的文本从0改变到1，而ClickCounter组件则不受任何影响因为class组件对应的节点没有任何DOM更新。

​	该函数的要点是它选择正确的效果类型并应用相应的操作。在我们的例子中，我们需要更新span元素的文本，所以我们在这里采用**Update**分支：

```javascript
function updateHostEffects() {
    switch (primaryEffectTag) {
      case Placement: {...}
      case PlacementAndUpdate: {...}
      case Update:
        {
          var current = nextEffect.alternate;
          commitWork(current, nextEffect);
          break;
        }
      case Deletion: {...}
    }
}
```



​	继续执行**commitWork**，react会执行[**updateDOMProperties**](https://github.com/facebook/react/blob/8a8d973d3cc5623676a84f87af66ef9259c3937c/packages/react-dom/src/client/ReactDOMComponent.js#L326)函数，他将在render阶段添加的updateQueue应用到fiber节点上，并更新**span**元素的**textContent**属性。

```javascript
function updateDOMProperties(domElement, updatePayload, ...) {
  for (let i = 0; i < updatePayload.length; i += 2) {
    const propKey = updatePayload[i];
    const propValue = updatePayload[i + 1];
    if (propKey === STYLE) { ...} 
    else if (propKey === DANGEROUSLY_SET_INNER_HTML) {...} 
    else if (propKey === CHILDREN) {
      setTextContent(domElement, propValue);
    } else {...}
  }
}
```

​	当DOM更新被执行后，react将**finishedWork**树分配到**HostRoot**：

```javascript
root.current = finishedWork;
```



### Calling post mutation lifecycle hooks

​	剩下的最后一个函数是[**commitAllLifecycles**](https://github.com/facebook/react/blob/d5e1bf07d086e4fc1998653331adecddcd0f5274/packages/react-reconciler/src/ReactFiberScheduler.js#L479)。在这里react会调用更新后的生命周期。在render阶段中，react添加**Update** effect到**ClickCounter**组件中。这是**commitAllLifecycles**查找并调用的其中一个周期。

```javascript
function commitAllLifeCycles(finishedRoot, ...) {
    while (nextEffect !== null) {
        const effectTag = nextEffect.effectTag;

        if (effectTag & (Update | Callback)) {
            const current = nextEffect.alternate;
            commitLifeCycles(finishedRoot, current, nextEffect, ...);
        }
        
        if (effectTag & Ref) {
            commitAttachRef(nextEffect);
        }
        
        nextEffect = nextEffect.nextEffect;
    }
}
```

​	在这个函数中，react也会调用第一次被渲染的组件的**cDM**