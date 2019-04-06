---
title: React中的Scheduler
date: '2019-04-06'
spoiler: 并行模式没什么难的，我们从Scheduler开始学起。
---

https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestIdleCallback

https://medium.com/@paul_irish/requestanimationframe-scheduling-for-nerds-9c57f7438ef4

## React中的requestIdleCallback

>剩下的代码是实质上是requestIdleCallback的polyfill，通过调度rAF，存储帧开始的时间，然后在绘制(paint)后安排一个postMessage请求。
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

​	在初始化完成后，React会根据是否有window，messageChannel等对象判断当前运行环境，执行不同的流程。这里只看正常的浏览器环境。

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

为了阅读更清晰，下面的代码顺序与React源码中的不太相同。

### requestHostCallback&&cancelHostCallback

rIC的polyfill中最外层的代码是**requestHostCallback**和**cancelHostCallback**。requestHostCallback的入参和rIC的相似，传入需要调用的函数和必须执行时间。

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

animationTick是React传入rAF中的回调函数

```javascript
  var animationTick = function (rafTime) {
    if (scheduledHostCallback !== null) {
      // Eagerly schedule the next animation callback at the beginning of the
      // frame. If the scheduler queue is not empty at the end of the frame, it
      // will continue flushing inside that callback. If the queue *is* empty,
      // then it will exit immediately. Posting the callback at the start of the
      // frame ensures it's fired within the earliest possible frame. If we
      // waited until the end of the frame to post the callback, we risk the
      // browser skipping a frame and not firing the callback until the frame
      // after that.
      requestAnimationFrameWithTimeout(animationTick);
    } else {
      // No pending work. Exit.
      isAnimationFrameScheduled = false;
      return;
    }

    var nextFrameTime = rafTime - frameDeadline + activeFrameTime;
    if (
      nextFrameTime < activeFrameTime &&
      previousFrameTime < activeFrameTime
    ) {
      if (nextFrameTime < 8) {
        // Defensive coding. We don't support higher frame rates than 120hz.
        // If the calculated frame time gets lower than 8, it is probably a bug.
        nextFrameTime = 8;
      }
      // If one frame goes long, then the next one can be short to catch up.
      // If two frames are short in a row, then that's an indication that we
      // actually have a higher frame rate than what we're currently optimizing.
      // We adjust our heuristic dynamically accordingly. For example, if we're
      // running on 120hz display or 90hz VR display.
      // Take the max of the two in case one of them was an anomaly due to
      // missed frame deadlines.
      activeFrameTime =
        nextFrameTime < previousFrameTime ? previousFrameTime : nextFrameTime;
    } else {
      previousFrameTime = nextFrameTime;
    }
    frameDeadline = rafTime + activeFrameTime;
    if (!isMessageEventScheduled) {
      isMessageEventScheduled = true;
      port.postMessage(undefined);
    }
  };
```



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
      // There's no time left in this idle period. Check if the callback has
      // a timeout and whether it's been exceeded.
      if (prevTimeoutTime !== -1 && prevTimeoutTime <= currentTime) {
        // Exceeded the timeout. Invoke the callback even though there's no
        // time left.
        didTimeout = true;
      } else {
        // No timeout.
        if (!isAnimationFrameScheduled) {
          // Schedule another animation callback so we retry later.
          isAnimationFrameScheduled = true;
          requestAnimationFrameWithTimeout(animationTick);
        }
        // Exit without invoking the callback.
        scheduledHostCallback = prevScheduledCallback;
        timeoutTime = prevTimeoutTime;
        return;
      }
    }

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

