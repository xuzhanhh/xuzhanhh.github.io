---
title: 神奇的CSS世界(1)

date: '2019-03-20'

spoiler: 嵌套absolute会发生什么有趣的事情？

---

## 前言

今天遇到了一个神奇的Popover组件bug，起初还想甩锅给dom-align的，后来定位发现弹出元素的宽高在显隐时宽高不同导致dom-align计算错误。经过debug发现这个宽高问题是absolute嵌套引起的

**以下代码可以在这里：[传送门](https://codesandbox.io/s/o4j6wq9oq9) 试玩**

## 只有一层absolute的情况

正常文档流是等于父元素的宽度。`position: abusolute`让元素脱离了正常的文档流，宽度为最小宽度（子元素或内容撑起的宽度）。即默认宽度为body的width:100%

## 当有两层absolute嵌套时

具体代码如下:

```jsx
//html
 <div className="wrapper">
        <div className="inner">
          删除后需点击「发布」才能生效哦～请问是否确定要删除？
        </div>
 </div>
//css
.wrapper {
  position: absolute;
  left: 10px;
  top: 140px;
}
.inner {
  position: absolute;
}
```

得出的结果如下，子节点是被压缩到最小宽度

![image-20190320003513604](./images/image-20190320003513604.png)

经过google得出以下结论

> Because they are already nested under position: absolute; parent i.e .container and since no width is assigned, it will take the minimal width and hence

因为他被级联在position为absolute的父容器中所以他没有设定默认宽，因此他会选择最小的宽。

当我知道这个结论是我是惊了，css真的比js难多了哈哈哈



## 拓展

从上面的结论我们不禁联想了，那么这个脱离了文档流的父容器要怎么样才能设定他的宽呢?

我们把html改成如下结构

```jsx
      <div className="wrapper">
        <p>我可以把下面的内容撑开</p>
        <div className="inner">
          删除后需点击「发布」才能生效哦～请问是否确定要删除？
        </div>
      </div>
```

![image-20190320003441607](./images/image-20190320003441607.png)

发现这个父容器的宽真的被撑开了，所以嵌套父容器的absolute子容器也有默认的宽度了，子容器里的内容的宽也能随着父容器的宽变化而变化

## 结论

