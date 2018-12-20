---

title: react 16.7

date: '2018-12-20'

spoiler: 是的，hooks还没来

---
# react 16.7

## React DOM

### 1. Fix performance of `React.lazy` for large numbers of lazily-loaded components. ([@acdlite](https://github.com/acdlite) in [#14429](https://github.com/facebook/react/pull/14429)) 

### 2. Clear fields on unmount to avoid memory leaks. ([@trueadm](https://github.com/trueadm) in [#14276](https://github.com/facebook/react/pull/14276)) 

### 3. Fix bug with SSR and context when mixing `react-dom/server@16.6` and `react@<16.6`. ([@gaearon](https://github.com/gaearon) in [#14291](https://github.com/facebook/react/pull/14291)) 

### 4. Fix a performance regression in profiling mode. ([@bvaughn](https://github.com/bvaughn) in [#14383](https://github.com/facebook/react/pull/14383))



## Scheduler

### 1. Post to MessageChannel instead of window. ([@acdlite](https://github.com/acdlite) in [#14234](https://github.com/facebook/react/pull/14234))

​	Scheduler需要在paint之后触发一个task（会用window去postMessage），在队列为空之前每一帧都会发生都会触发。这会导致其他message event handler每一帧都会被调用，即使它们立即退出，这也会增加每帧的显着开销。所以改用MessageChannel

```javascript
 if (typeof MessageChannel === 'function') {
    // Use a MessageChannel, if support exists
    var channel = new MessageChannel();
    channel.port1.onmessage = idleTick;
    port = channel.port2;
  } 
```

### 2. Reduce serialization overhead. ([@developit](https://github.com/developit) in [#14249](https://github.com/facebook/react/pull/14249))

在切换到MessageChannel的过程中，还是传递了"*"。 这实际上最终会触发序列化。 为了节省一些性能，改用undefined，因为传递一个像0这样的数字仍然会产生序列化开销 

具体可以看*https://cs.chromium.org/chromium/src/third_party/blink/renderer/bindings/core/v8/script_value.h?type=cs&g=0&l=74* 

```
    -  port.postMessage('*');
    +  port.postMessage(undefined);
```

### 3. Fix fallback to `setTimeout` in testing environments. ([@bvaughn](https://github.com/bvaughn) in [#14358](https://github.com/facebook/react/pull/14358))

### 4. Add methods for debugging. ([@mrkev](https://github.com/mrkev) in [#14053](https://github.com/facebook/react/pull/14053))
