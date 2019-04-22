---
title: React diff 中的 reconcileChildrenArray
date: '2019-04-20'
spoiler: 剖析O(n)的diff算法是怎么样的
---


React在比对子fiber时，会根据子fiber类型在`reconcileChildFibers`里有不同的比对方案：`reconcileSingleElement`、`reconcileSinglePortal`、`reconcileSingleTextNode`、`reconcileChildrenArray`、`reconcileChildrenIterator`， 而`reconcileChildrenArray`是最为复杂的比对场景。

## 源码运行

具体的运行时代码就不一一展示了，大概就是下面的代码这种的变种，测试各种条件

```jsx
    <div>
	   {/* {data === 0 ? <span>{data}</span> : <p>{data}</p>} */}
      {null}
      {data === 0 ? null : <p>{data}</p>}
      <input onChange={onChange}></input>
      {data === 0 ? <span>{data}</span> : <p>{data}</p>}
      <button onClick={handleClick}></button>
    </div>
```

代码分析：

```javascript
  function reconcileChildrenArray(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildren: Array<*>,
    expirationTime: ExpirationTime,
  ): Fiber | null {

    // 这个算法不能通过两端搜索进行优化因为React的Fibers节点上没有尾指针（backpointers）
    // 我试图看看我们可以用这个模型得到多远。如果它最终不值得权衡，我们可以稍后添加它@Seb
    
    if (__DEV__) {
      // dev的情况检查有没有重复key
      let knownKeys = null;
      for (let i = 0; i < newChildren.length; i++) {
        const child = newChildren[i];
        knownKeys = warnOnInvalidKey(child, knownKeys);
      }
    }

    let resultingFirstChild: Fiber | null = null;
    let previousNewFiber: Fiber | null = null;

    let oldFiber = currentFirstChild;
    let lastPlacedIndex = 0;
    let newIdx = 0;
    let nextOldFiber = null;
    // 第一次遍历，快比较
    for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
      if (oldFiber.index > newIdx) {
        nextOldFiber = oldFiber;
        oldFiber = null;
      } else {
        nextOldFiber = oldFiber.sibling;
      }
      const newFiber = updateSlot(
        returnFiber,
        oldFiber,
        newChildren[newIdx],
        expirationTime,
      );
      if (newFiber === null) {
        // 如果fiber节点为null这种空插槽或同index下fiber类型不同会跳出快比较，这会导致慢比较
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }
        break;
      }
      if (shouldTrackSideEffects) {
        if (oldFiber && newFiber.alternate === null) {
		   // 如果是更新时候则需要删除旧节点
          deleteChild(returnFiber, oldFiber);
        }
      }
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      if (previousNewFiber === null) {
        // TODO: Move out of the loop. This only happens for the first run.
        resultingFirstChild = newFiber;
      } else {
        // TODO: Defer siblings if we're not at the right index for this slot.
        // I.e. if we had null values before, then we want to defer this
        // for each null value. However, we also don't want to call updateSlot
        // with the previous one.
        previousNewFiber.sibling = newFiber;
      }
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }

    if (newIdx === newChildren.length) {
      // 新孩子节点已经遍历完成，可以删除剩下的老节点
      deleteRemainingChildren(returnFiber, oldFiber);
      return resultingFirstChild;
    }

    if (oldFiber === null) {
      // 如果老孩子节点已经遍历完成，意味着剩下的新节点都会被插入，直接批处理
      for (; newIdx < newChildren.length; newIdx++) {
        const newFiber = createChild(
          returnFiber,
          newChildren[newIdx],
          expirationTime,
        );
        if (!newFiber) {
          continue;
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (previousNewFiber === null) {
          // TODO: Move out of the loop. This only happens for the first run.
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
      return resultingFirstChild;
    }

    // 为了快速查找，将所有旧fiber根据key和index存到map中
    const existingChildren = mapRemainingChildren(returnFiber, oldFiber);

    // 慢比较
    for (; newIdx < newChildren.length; newIdx++) {
      // 如果有旧节点，复用。如果没有则创建新的fiber
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        newChildren[newIdx],
        expirationTime,
      );
      if (newFiber) {
        if (shouldTrackSideEffects) {
          if (newFiber.alternate !== null) {
            // 如果复用了旧fiber节点，则将其从当前孩子列表中移除，避免稍后的删除
            existingChildren.delete(
              newFiber.key === null ? newIdx : newFiber.key,
            );
          }
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        // 拼接fiber节点
        if (previousNewFiber === null) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      // 将没有复用的旧fiber节点删除
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    return resultingFirstChild;
  }
```

Ps: 居然还有三个三年前就留下的TODO。

## 细节分析

快比较循环，先遍历新元素链，找到index相同的元素，主要判断key是否相同，相同的话update老节点生成新节点newFiber。如果遍历到的相同index而元素不相等或为null的情况则结束第一个循环。

第一次遍历完后：

- 新链结束老链没有：把老链中剩余的fiber都删除
- 老链结束新链没有：把新链中剩下的都插入
- 如果函数到现在还没return，则进入慢比较循环：把老链按key放入map里，遍历新链，从老链中找和新链key相同的fiber，更新成newfiber，供后面赋值给previousNewFiber构成新链中的一环并进行下一轮循环，也是个链表元素移动的过程，再将老链中该元素删除。遍历处理完所有newChildren生成新链后，删除老链中剩下的元素

