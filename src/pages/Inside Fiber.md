---

title: Inside Fiber

date: '2018-12-13'

spoiler: 当我们在讨论Fiber时，我们在讨论什么。

---

[read this](https://medium.com/react-in-depth/inside-fiber-in-depth-overview-of-the-new-reconciliation-algorithm-in-react-e1c04700ef6e)

## createFiberFromTypeAndProps

​	当一个React元素第一次被转换成fiber node时，React使用createFiberFromTypeAndProps。在随后的更新中React会重用fiber node且只更新从当前React元素获取必须的属性。React还会根据key属性在目录中移动结点位置或删除它如果react元素的render方法没有返回值。

>查看[**ChildReconciler**](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactChildFiber.js#L239)方法得到所有行动和React针对当前的fiber结点类型执行的相应的方法

## current和workInProgress tree

​	第一次render结束后，React会生成一个fiber tree映射应用的状态和UI，这个tree一般叫`current`。当React准备开始更新时会构建一个`workInProgress `tree，反映将被渲染到屏幕的将来的状态。

​	所有的fibers上的工作都会在workInProgress tree上执行。当React遍历current tree时，每一个存在的结点都会创建一个alternate node来构成workInProgress tree。当更新完成且所有的相关工作完成时，React准备将alternate tree渲染到屏幕上。一旦workInProgress tree被渲染到屏幕上，他就会变成current tree。

​	在代码中你会见到很多函数需要current和workInProgress tree：

```javascript
function updateHostComponent(current, workInProgress, renderExpirationTime) {...}
```

​	每一个fiber结点的alternate属性会是它在另外一颗树上的副本的引用。一个current tree上的结点会指向workInprogress tree上的结点，反之亦然。

## Side-effects && Effects list

​	每一个fiber结点可以有与之相关的作用，这些被放在effectTag字段中。所以fiber的effects基本定义了实例在更新完后需要处理的[工作](https://github.com/facebook/react/blob/b87aabdfe1b7461e7331abb3601d9e6bb27544bc/packages/shared/ReactSideEffectTags.js)。例如host组件（DOM 元素）会有adding, updating or removing elements。类组件会有更新refs，调用cDM和cDU生命周期。

​	React会构建一个有effects的fiber结点的线性列表去快速遍历。遍历线性列表比遍历树快很多，且没必要花费时间在没有副作用的结点上。这个列表是`finishedWork`tree的子集且它在current和workInProgress tree中使用nextEffect属性链接而不是child属性。

​	例如，我们的更新会导致`c2`插入到DOM中，`d2`和`c1`改变DOM属性，`b2`触发生命周期。effect list会连接他们所以React可以跳过其他结点。

![img](http://pjpqjxkf6.bkt.clouddn.com/1%2AQ0pCNcK1FfCttek32X_l7A.png)

![img](http://pjpqjxkf6.bkt.clouddn.com/1%2AmbeZ1EsfMsLUk-9hOYyozw.png)

可以看得到，React会从children再到parents执行effects。

## Fiber tree的根节点

React对每一个这些container创建[fiber root](https://github.com/facebook/react/blob/0dc0ddc1ef5f90fe48b58f1a1ba753757961fc74/packages/react-reconciler/src/ReactFiberRoot.js#L31)，你可以这样找到他们

```javascript
const fiberRoot = $('#app')._reactRootContainer._internalRoot
```

 fiber root的current属性中是React存放fiber tree的地方。

```javascript
const hostRootFiberNode = fiberRoot.current
```

fiber tree会用[一种特别的类型的fiber结点](https://github.com/facebook/react/blob/cbbc2b6c4d0d8519145560bd8183ecde55168b12/packages/shared/ReactWorkTags.js#L34)开始：`HostRoot`，通过`stateNode`可以从`HostRoot`fiber结点返回FiberRoot

```javascript
fiberRoot.current.stateNode === fiberRoot; // true
```

## Fiber node structure

### stateNode

保持fiber对本地状态的联系， 保存对组件的类实例，DOM节点或与fiber节点关联的其他React元素类型的引用。

### type

定义与此fiber节点关联的功能或类，对于class组件，它指向constructor函数，对于DOM元素，它是HTML tag。

### tag

定义[fiber节点的类型](https://github.com/facebook/react/blob/769b1f270e1251d9dbdce0fcbd9e92e502d059b8/packages/shared/ReactWorkTags.js)。被用于决定需要在reconciliation中做什么工作。

### updateQueue

状态更新，回调和DOM更新的队列。

### memoizedState

fiber用于创建输出的state。处理更新时，它会反映当前在屏幕上呈现的状态。

### memoizedProps

在上一次render中fiber用于创建输出的props

### pendingProps

已经从react新元素中更新的props并且需要应用于子组件或DOM元素

你可以在[这里](https://github.com/facebook/react/blob/6e4f7c788603dac7fccd227a4852c110b072fe16/packages/react-reconciler/src/ReactFiber.js#L78)找到完整的fiber结构

## 主要流程

### render阶段

reconcile通常从`HostRoot`fiber结点，并通过[renderRoot](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactFiberScheduler.js#L1132)方法开始。但是，React会快速跳过已经处理过的fiber节点知道他找到一个未完成工作的结点。 

#### work loop的主要步骤

​	所有fiber节点 [在work loop中](https://github.com/facebook/react/blob/f765f022534958bcf49120bf23bc1aa665e8f651/packages/react-reconciler/src/ReactFiberScheduler.js#L1136)被处理，这里是同步部分的work loop实现：

```javascript
function workLoop(isYieldy) {
  if (!isYieldy) {
    while (nextUnitOfWork !== null) {
      nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    }
  } else {...}
}
```

`nextUnitOfWork`会保留对`workInProgress`tree中需要处理的fiber节点的引用。当React遍历fiber tree时，会用这个变量去知晓这里是否有其他未完成工作的fiber结点。

这里会有四个主要函数用于遍历tree和发起或完成工作：

- [performUnitOfWork](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactFiberScheduler.js#L1056)
- [beginWork](https://github.com/facebook/react/blob/cbbc2b6c4d0d8519145560bd8183ecde55168b12/packages/react-reconciler/src/ReactFiberBeginWork.js#L1489)
- [completeUnitOfWork](https://github.com/facebook/react/blob/95a313ec0b957f71798a69d8e83408f40e76765b/packages/react-reconciler/src/ReactFiberScheduler.js#L879)
- [completeWork](https://github.com/facebook/react/blob/cbbc2b6c4d0d8519145560bd8183ecde55168b12/packages/react-reconciler/src/ReactFiberCompleteWork.js#L532)

![img](http://pjpqjxkf6.bkt.clouddn.com/1%2AA3-yF-3Xf47nPamFpRm64w.gif)

[这里是视频](https://vimeo.com/302222454)

```javascript
function performUnitOfWork(workInProgress) {
    let next = beginWork(workInProgress);
    if (next === null) {
        next = completeUnitOfWork(workInProgress);
    }
    return next;
}

function beginWork(workInProgress) {
    console.log('work performed for ' + workInProgress.name);
    return workInProgress.child;
```

​	performUnitOfWork从workInProgress tree中接收一个fiber节点然后开始调用beginWork工作。beginWork是开始所有需要执行行动的函数，为了示范，我们简单输出fiber的名字去记录工作已经完成。beginWork总是会返回下一个处理循环的孩子或者null，

​	如果有下一个孩子，他会赋予workLoop中的nextUnitOfWork。如果没有孩子，React知道已经到达分支的结尾所以他可以完成当前节点。一旦节点完成，它需要为兄弟姐妹执行工作并向父母回溯，这部分会在completeUnitOfWork中完成。

```javascript
function completeUnitOfWork(workInProgress) {
    while (true) {
        let returnFiber = workInProgress.return;
        let siblingFiber = workInProgress.sibling;

        nextUnitOfWork = completeWork(workInProgress);

        if (siblingFiber !== null) {
            // If there is a sibling, return it
            // to perform work for this sibling
            return siblingFiber;
        } else if (returnFiber !== null) {
            // If there's no more work in this returnFiber,
            // continue the loop to complete the parent.
            workInProgress = returnFiber;
            continue;
        } else {
            // We've reached the root.
            return null;
        }
    }
}

function completeWork(workInProgress) {
    console.log('work completed for ' + workInProgress.name);
    return null;
}
```

​	在completeUnitOfWork中，React只完成上一个兄弟节点的工作，他没有完成父亲节点的工作。只有在完成以子节点开始的所有分支后，才能完成父节点和回溯的工作。

​	从实现中可以看出，performUnitOfWork和completeUnitOfWork主要用于迭代目的，而主要活动则在beginWork和completeWork函数中进行。 在本系列的以下文章中，我们将了解ClickCounter组件和span节点会发生什么，因为React步入beginWork和completeWork函数。

### commit 阶段

