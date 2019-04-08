---
title: React中的concurrent mode(1)
date: '2019-04-06'
spoiler: 并行模式没什么难的，我们从Scheduler开始学起。
---



## rAF的调度方式

### 1. 所有rAF回调始终在相同或下一个帧中运行

&nbsp;&nbsp;&nbsp;&nbsp;在事件处理程序中排队的任何rAF都将在同一帧中执行。 在rAF中排队的任何rAF将在下一帧中执行。

### 2. 每一个你触发的rAF都会运行

&nbsp;&nbsp;&nbsp;&nbsp;尽管执行时间很长，rAF也不会受到限制。例如队列中有五个rAF回调，每个都会占用100ms时间。浏览器依然不会分发他们到每一帧中，而是在同一帧中执行，尽管它会占用500ms时间。这会造成一个严重的阻塞。

以下两种情况就会触发这个问题：

&nbsp;&nbsp;&nbsp;&nbsp;1. 在一个rAF结尾请求一个新的callback
&nbsp;&nbsp;&nbsp;&nbsp;2. 你在一个input时间处理器中调用rAF，这样可能在一帧中调用多次。

&nbsp;&nbsp;&nbsp;&nbsp;**你可以自己合并rAF**。因此：如果在同一帧内有多个“相同”回调触发，则必须管理调度/合并。也就是说，Chrome等浏览区会尝试解决这个问题。如果rAF正在占用主线程，浏览器将开始限制输入事件，以便希望争用将被清除。

## 一帧里浏览器会做什么

主线程：![img](/images/1*ad-k5hYKQnRQJF8tv8BIqg.png)

多线程：

![img](/images/1*atEwskfs0gtIryRrgnAPkw.png)

## 如何定义requestIdleCallback

w3c对requestIdelCallback的非规范定义如下:

&nbsp;&nbsp;&nbsp;&nbsp;在输入处理，给定帧的渲染和合成完成之后，用户代理的主线程经常变为空闲，直到下一帧开始;另一个待处理的任务有资格运行;或收到用户输入。此规范提供了一种通过requestIdleCallback API在此空闲时间内调度回调执行的方法。通过requestIdleCallback API发布的回调有资格在用户代理定义的空闲时段内运行。

&nbsp;&nbsp;&nbsp;&nbsp;当执行空闲回调时，将给出对应于当前空闲时段结束的截止时间。关于什么构成空闲时段的决定是用户代理定义的，但是期望它们发生在浏览器期望空闲的静止时段中。

&nbsp;&nbsp;&nbsp;&nbsp;空闲时段的一个示例是在给定帧提交到屏幕和在活动动画期间开始下一帧处理之间的时间，如图1所示。这些空闲时段将在活动动画和屏幕更新期间频繁发生，但通常会非常短（即，对于具有60Hz vsync周期的设备，小于16ms）。

![Example of an inter-frame idle period.](/images/image01.png)

&nbsp;&nbsp;&nbsp;&nbsp;空闲时段的另一个示例是当用户代理空闲而没有发生屏幕更新时。 在这种情况下，用户代理可能没有即将到来的任务，它可以限制空闲时段的结束。

 &nbsp;&nbsp;&nbsp;&nbsp;为了避免在不可预测的任务中引起用户可察觉的延迟，例如用户输入的处理，这些空闲时段的长度应该被限制为最大值50ms。 一旦空闲时段结束，用户代理可以调度另一个空闲时段，如果它保持空闲，如图2所示，以使后台工作能够在更长的空闲时间段内继续发生。

![Example of an idle period when there are no pending frame updates.](/images/image00.png)

## React中的requestIdleCallback

>以下的代码是实质上是requestIdleCallback的polyfill，通过调度rAF，存储帧开始的时间，然后在绘制(paint)后安排一个postMessage请求。
>在postMessage处理逻辑中，React会在有限的时间中尽可能的多工作。
>通过将空闲调用(idle call)拆分到多次event tick，我们可以确保布局(layout), 绘制(paint)和其他浏览器工作在有效的时间中能正常的工作，而且帧率是动态调整的。

### 初始化处理

> React会先从需要的全局引用中捕获到本地引用，以防在代码执行的后续过程中全局引用受到改动导致不一致。

```javascript
var localDate = Date;

var localSetTimeout = typeof setTimeout === 'function' ? setTimeout : undefined;
var localClearTimeout =
  typeof clearTimeout === 'function' ? clearTimeout : undefined;

var localRequestAnimationFrame =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : undefined;
var localCancelAnimationFrame =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : undefined;

var getCurrentTime;

```



> 当页面不在前台时rAF不会运行。如果页面在后台则需要调度工作继续进行，因为页面需要继续加载。
>
> 因此React会用setTimeout继续调度作为备用。

```javascript
var ANIMATION_FRAME_TIMEOUT = 100;
var rAFID;
var rAFTimeoutID;
var requestAnimationFrameWithTimeout = function (callback) {
  // 触发一个rAF和setTimeout
  rAFID = localRequestAnimationFrame(function (timestamp) {
    // 触发了rAF则取消setTimeout
    localClearTimeout(rAFTimeoutID);
    callback(timestamp);
  });
  rAFTimeoutID = localSetTimeout(function () {
    // 触发了setTimeout则取消rAF
    localCancelAnimationFrame(rAFID);
    callback(getCurrentTime());
  }, ANIMATION_FRAME_TIMEOUT);
};
```

&nbsp;&nbsp;&nbsp;&nbsp;在初始化完成后，React会根据是否有window，messageChannel等对象判断当前运行环境，执行不同的流程。这里只看正常的浏览器环境。

```javascript

  var scheduledHostCallback = null;
  var isMessageEventScheduled = false;
  var timeoutTime = -1;

  var isAnimationFrameScheduled = false;

  var isFlushingHostCallback = false;

  var frameDeadline = 0;

  // React假设从30fps开始并通过启发式的跟踪调整速度。如果有更频繁的动画帧则frameTime更少
  var previousFrameTime = 33;
  var activeFrameTime = 33;

  shouldYieldToHost = function () {
    return frameDeadline <= getCurrentTime();
  };

  // React使用postMessage手段去延迟空闲工作的时间在重绘(repaint)之后
  var channel = new MessageChannel();
  var port = channel.port2;
```

&nbsp;&nbsp;&nbsp;&nbsp;为了阅读更清晰，下面的代码顺序与React源码中的不太相同。

### requestHostCallback&&cancelHostCallback

&nbsp;&nbsp;&nbsp;&nbsp;rIC的polyfill中最外层的代码是**requestHostCallback**和**cancelHostCallback**。requestHostCallback的入参和rIC的相似，传入需要调用的函数和必须执行时间。

```javascript
  requestHostCallback = function (callback, absoluteTimeout) {
    scheduledHostCallback = callback;
    timeoutTime = absoluteTimeout;
    if (isFlushingHostCallback || absoluteTimeout < 0) {
      // 如果上一个callback正在执行中或者absoluteTimeout<0，不等待下一帧，在一个新postMessage中尽快执行
      port.postMessage(undefined);
    } else if (!isAnimationFrameScheduled) {
      // 如果当前没有调度的rAF,调度一个
      // TODO: 如果因为浏览器节流导致rAF没有被触发，React考虑使用setTimeout触发rIC确保执行工作
      isAnimationFrameScheduled = true;
      requestAnimationFrameWithTimeout(animationTick);
    }
  };

  cancelHostCallback = function () {
    // 清空数据
    scheduledHostCallback = null;
    isMessageEventScheduled = false;
    timeoutTime = -1;
  };
```

### animationTick

&nbsp;&nbsp;&nbsp;&nbsp;animationTick是React传入rAF中的回调函数

```javascript
  var animationTick = function (rafTime) {
    if (scheduledHostCallback !== null) {
			//在帧的开头安排下一个动画回调。 如果调度程序队列在帧的末尾不为空，它将继续在该回调内刷新。 如果队列为空，则它将立即退出。
      // 如果队列为空，会立刻退出。在帧的开头调用rAF回调可确保在最早的帧内触发
      // 如果在帧结束时发布回调就有可能被浏览器跳过帧且不触发回调直到下一帧执行
      requestAnimationFrameWithTimeout(animationTick);
    } else {
      // 当前没有东西要处理了，结束rAF回调
      isAnimationFrameScheduled = false;
      return;
    }
		// 下一帧可用的时间等于当前时间-上一帧结束时间+帧可用时间
    var nextFrameTime = rafTime - frameDeadline + activeFrameTime;
    if (
      nextFrameTime < activeFrameTime &&
      previousFrameTime < activeFrameTime
    ) {
      if (nextFrameTime < 8) {
        //React不支持帧率高于120hz的浏览设备
        nextFrameTime = 8;
      }
      // 如果一帧长，那么下一帧可能很短。 
      // 如果两个帧连续短，那么这表明我们实际上具有比我们当前优化的帧速率更高的帧速率。 
      // 我们相应地动态调整启发式。 例如，如果我们在120hz显示器或90hz VR显示器上运行。 取两个中的最大值，以防其中一个由于错过帧截止日期而异常。
      activeFrameTime =
        nextFrameTime < previousFrameTime ? previousFrameTime : nextFrameTime;
    } else {
      previousFrameTime = nextFrameTime;
    }
    // 当前帧结束时间等于当前时间+帧可用时间
    frameDeadline = rafTime + activeFrameTime;
    // 如果当前没有postMessage触发
    if (!isMessageEventScheduled) { 
      isMessageEventScheduled = true;
      port.postMessage(undefined);
    }
  };
```

### onmessage(rIC的callback)

&nbsp;&nbsp;&nbsp;&nbsp;主要流程为检查当前帧还是否够时间触发callback，够就调用，不够就调用rAF等待下一帧

```javascript
  channel.port1.onmessage = function (event) {
    isMessageEventScheduled = false;

    var prevScheduledCallback = scheduledHostCallback;
    var prevTimeoutTime = timeoutTime;
    scheduledHostCallback = null;
    timeoutTime = -1;

    var currentTime = getCurrentTime();

    var didTimeout = false;
    if (frameDeadline - currentTime <= 0) {
      // 空闲阶段没有时间了，检查callback是否有超时时间和到时间了没
      if (prevTimeoutTime !== -1 && prevTimeoutTime <= currentTime) {
        // 到超时时间了，即时当前帧没时间了也要触发
        didTimeout = true;
      } else {
        // 还没到超时时间
        if (!isAnimationFrameScheduled) {
          // 触发一个rAF重试
          isAnimationFrameScheduled = true;
          requestAnimationFrameWithTimeout(animationTick);
        }
        // 不触发回调，把数据放回去并结束
        scheduledHostCallback = prevScheduledCallback;
        timeoutTime = prevTimeoutTime;
        return;
      }
    }
    // 够时间，触发callback，标记正在触发callback
    if (prevScheduledCallback !== null) {
      isFlushingHostCallback = true;
      try {
        prevScheduledCallback(didTimeout);
      } finally {
        isFlushingHostCallback = false;
      }
    }
  };
```

## 结尾语

&nbsp;&nbsp;&nbsp;&nbsp;本文到这里就先结束了，在这篇blog中，我们学习rAF的调度方式、一帧里浏览器会做什么、如何定义rIC以及React是怎么实现rIC的，主要是通过rAF+postmessage实现的。但是我们还没接触到React的并行模式是怎么调用rIC的，这个请期待本系列的下一篇blog。



## 参考文献

https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestIdleCallback

https://medium.com/@paul_irish/requestanimationframe-scheduling-for-nerds-9c57f7438ef4

https://w3c.github.io/requestidlecallback/#idle-periods