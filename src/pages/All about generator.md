---
title: All about generator
date: '2019-01-23'
spoiler: 重新学习javaScript异步
---

## co的基本实现

```javascript
const get = (url)=> {
  return fetch(url).then(function(response) {
    return response.json();
  })
}

function* getData(){
  let data = yield get('https://api.github.com/users/github')
  console.log(data)
  return data
}

const co = (gen) => {
  ctx = gen()
  return new Promise((resolve, reject)=>{
    const temp = (value)=> {
      let val = ctx.next(value)
      console.log('temp', value, val)
      if(val.done){
        return resolve(val.value)
      }
      val.value.then(data=>temp(data))
    }
    temp()
  })
}
co(getData).then(data=> {console.log("!!!!",data) })
```