---
title: Promise
date: '2018-07-25'
spoiler: 见识了一道面试题，重温一下Promise。
---

# Promise

见识了一道面试题，重温一下Promise。

## 题目

```javascript
const timeout = ms => new Promise((resolve, reject) => {
 setTimeout(() => {
  resolve();
 }, ms);
});

const ajax1 = () => timeout(2000).then(() => {
 console.log('1');
 return 1;
});

const ajax2 = () => timeout(1000).then(() => {
 console.log('2');
 return 2;
});

const ajax3 = () => timeout(2000).then(() => {
 console.log('3');
 return 3;
});

mergePromise = ajaxArray => {
  //填这里
}

mergePromise([ajax1, ajax2, ajax3]).then(data => {
 console.log('done');
 console.log(data); 
});

// 分别输出
// 1
// 2
// 3
// done
// [1, 2, 3]
```

## 分析

​	乍看题目没什么困难，要实现也可以强行用timeout延迟ajax2的调用。但是题目肯定不是做完就好了，就在想mergePromise能否写成能实现fc，而不是仅仅完成这一题。难点就在于如何解决forEach或者使用reduce后还能保持then的状态



## 我理解的Promise

> 所谓`Promise`，简单说就是一个容器，里面保存着某个未来才会结束的事件（通常是一个异步操作）的结果。从语法上说，Promise 是一个对象，从它可以获取异步操作的消息。Promise 提供统一的 API，各种异步操作都可以用同样的方法进行处理。

> 特点：
>
>   一旦状态改变，就不会再变，任何时候都可以得到这个结果。`Promise`对象的状态改变，只有两种可能：从`pending`变为`fulfilled`和从`pending`变为`rejected`。只要这两种情况发生，状态就凝固了，不会再变了，会一直保持这个结果，这时就称为 resolved（已定型）。如果改变已经发生了，你再对`Promise`对象添加回调函数，也会立即得到这个结果。这与事件（Event）完全不同，事件的特点是，如果你错过了它，再去监听，是得不到结果的。

 核心是要理解容器与状态改变后就不会再变的状态。所以根据这个特性可以拓展forEach只能同步执行的弱点，通过forEach将ajaxArray拼在一条Promise链中。



## Promise学习

### 一个简单的延时器

```javascript
function timeout(ms) {
 	return new Promise((resolve,reject)=>{
	setTimeout(resolve, ms)
})   
}
```



### Promise嵌套

```javascript
const p1 = new Promise(function (resolve, reject) {
  setTimeout(() => reject(new Error('fail')), 3000)
})

const p2 = new Promise(function (resolve, reject) {
  setTimeout(() => resolve(p1), 1000)
})

p2
  .then(result => console.log(result))
  .catch(error => console.log(error))
// Error: fail
```

上面代码中，p1是一个 Promise，3 秒之后变为rejected。p2的状态在 1 秒之后改变，resolve方法返回的是p1。由于p2返回的是另一个 Promise，导致p2自己的状态无效了，由p1的状态决定p2的状态。所以，后面的then语句都变成针对后者（p1）。又过了 2 秒，p1变为rejected，导致触发catch方法指定的回调函数。



### Promise.resolve()

有时需要将现有对象转为 Promise 对象，`Promise.resolve`方法就起到这个作用。

`Promise.resolve`等价于下面的写法。

```javascript
Promise.resolve('foo')
// 等价于
new Promise(resolve => resolve('foo'))
```



## 答案

构建顺序执行异步任务的基本块是

```javascript
var sequence = Promise.resolve();
array.forEach(function(item) {
sequence = sequence.then(//deal item)
});
```



```javascript
mergePromise = ajaxArray => {
    //起始的promise
    var sequence = Promise.resolve();
    // 存放数组中每一个promise的结果
    let ret = [];
    //为了实现Promise链的延续，这里必须返回一个promise，而且返回值是ret
    return new Promise((reslove, reject)=> 
        ajaxArray.forEach(function(func) {
        	//这里的forEach是同步执行的
            sequence = sequence.then(function() {
                return func()
            }).then(function(data) {
                ret.push(data)
                if(ret.length===ajaxArray.length){
                    reslove(ret)
                    }
                })

            console.log('!!!', sequence)
        })
        )
}

mergePromise([ajax1, ajax2, ajax3]).then(data => {
 console.log('done');
 console.log(data); 
});
```





