---
title: TypeScript备忘录
date: '2019-04-10'
spoiler: 学习笔记
---
## 交叉类型

在 JavaScript 中， `extend` 是一种非常常见的模式，在这种模式中，你可以从两个对象中创建一个新对象，新对象会拥有着两个对象所有的功能。交叉类型可以让你安全的使用此种模式

```typescript
function extend<T, U>(first: T, second: U): T & U {
  const result = <T & U>{};
  for (let id in first) {
    (<T>result)[id] = first[id];
  }
  for (let id in second) {
    if (!result.hasOwnProperty(id)) {
      (<U>result)[id] = second[id];
    }
  }

  return result;
}

const x = extend({ a: 'hello' }, { b: 42 });

// 现在 x 拥有了 a 属性与 b 属性
const a = x.a;
const b = x.b;
```



## type和interface的不同点

### type可以但是interface不行

* type可以声明基本类型别名，联合类型，元祖等类型

  ```typescript
  // 基本类型别名
  type Name = string
  
  // 联合类型
  interface Dog {
      wong();
  }
  interface Cat {
      miao();
  }
  
  type Pet = Dog | Cat
  
  // 具体定义数组每个位置的类型
  type PetList = [Dog, Pet]
  
  ```

* type 语句中还可以使用 typeof 获取实例的 类型进行赋值

  ```typescript
  // 当你想获取一个变量的类型时，使用 typeof
  let div = document.createElement('div');
  type B = typeof div
  ```

* 其他骚操作

  ```typescript
  type StringOrNumber = string | number;  
  type Text = string | { text: string };  
  type NameLookup = Dictionary<string, Person>;  
  type Callback<T> = (data: T) => void;  
  type Pair<T> = [T, T];  
  type Coordinates = Pair<number>;  
  type Tree<T> = T | { left: Tree<T>, right: Tree<T> };
  ```

### interface可以但type不行

* interface能声明合并

  ```typescript
  interface User {
    name: string
    age: number
  }
  
  interface User {
    sex: string
  }
  
  /*
  User 接口为 {
    name: string
    age: number
    sex: string 
  }
  */
  ```

  

## implements和extends的区别

- **extends** means:

The **new class is a child**. It gets benefits coming with inheritance. It has all properties, methods as its parent. It can override some of these and implement new, but the parent stuff is already included.

- **implements** means:

The **new class** can be treated as **the same "shape"**, while **it is not a child**. It could be passed to any method where the `Person` is required, regardless of having different parent than `Person`