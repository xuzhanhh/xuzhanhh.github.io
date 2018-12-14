---
title: react hooks@seb
date: '2018-12-11'
spoiler: 随手翻译，我觉得dan会用人话再说一遍的。
---

翻译这个 [issue](https://github.com/reactjs/rfcs/pull/68#issuecomment-439314884)

## 注入模型

​	基本上，争论分解为想要交换(swap out)实现钩子的代码(the code that implements the hooks)。这类似于一般依赖注入和控制问题的反转(inversion of control problem)。React没有自己的依赖注入系统（不同于Angular）。通常他不需要这个因为大多数入口都是pull而不是push。对于其他代码，模块系统已经提供了良好的依赖注入边界，对于测试，我们倾向于推荐其他技术，例如在模块系统级别进行模拟（例如使用jest）

​	一些例外是像setState, replaceState, isMounted, findDOMNode, batchedUpdates等API，一个小的事实是React已经使用依赖注入将“updater”插入到Component base class。这是构造函数的第三个参数。该组件实际上不需要做任何事情。这就是让React在React ART或React Test Renderer等相同环境中的不同版本中具有多种不同类型的渲染器实现的原因。 自定义渲染器已经利用了这一点。

```javascript
import ReactNoopUpdateQueue from './ReactNoopUpdateQueue';
/**
 * Base class helpers for the updating state of a component.
 */
function Component(props, context, updater) {
  this.props = props;
  this.context = context;
  // If a component has string refs, we will assign a different object later.
  this.refs = emptyObject;
  // We initialize the default updater but the real one gets injected by the
  // renderer.
  this.updater = updater || ReactNoopUpdateQueue;
}
```

​	理论上，像React-clones这样的第三方库可以使用updater来注入他们的实现。实践中，大部分倾向于使用module shimming来替换整个react模块，因为他们有权衡或者想要实现其他API（例如， 移除dev模式内容或者将base classes和实现细节合并）

​	这些选项仍然保留在hooks的程序中。hooks的实现实际上没有在react包中实现，它只是调用当前的“调度程序”（dispatcher）。就如我上面解释的那样，可以暂时覆盖任何给定点的实现。这就是react渲染器（renderers）让多个渲染器共享相同API。例如，你可以让一个钩子测试调度程序（hooks test dispatcher）只是为了单元测试hooks。目前他有一个看起来很可怕的名字不过我们可以很容器的改变这个名词，这不是设计的缺陷（flaw of the design）。现在“调度程序（dispatcher）”可以移动到用户空间中，但是这会增加额外的噪音，这些噪音几乎从来不与单个组件的作者相关（but this adds additional noise for something that almost never is relevant to the author of an individual component），就像大多数人不知道React中的updater一样。

​	总的来说，我们可能会使用更多的静态函数调用因为他们更适合tree-shaking和更好地优化和内联。

​	另一个问题是hooks的主入口在react包中而不是第三方包，在未来很有可能其他代码会移除react包所以hooks会是剩下的大部分内容，所以包体积不需要担心。唯一的问题是hooks属于react下的而不是更通用的。例如，Vue曾经考虑过hooks API。但是hooks的关键是其原函数我们已经定义好的。这与Vue有完全不同的原函数。我们已经迭代了我们的函数。其他库可能会提出略有不同的原函数。在这一点上，过早地使这些过于笼统是没有意义的。第一次迭代在react包上的事实只是为了说明这就是我们对原函数的看法。如果存在重叠，那么就没有什么能阻止我们在第三方命名包上与其他库进行整合，并将反应的那些转发到该包。

## 依赖持续调用顺序

​	要明确的是，执行顺序的依赖并不是我们真正想要的。 首先放置useState或useEffect或类似的东西并不重要。React有很多依赖于执行顺序的模式，只是因为在渲染中允许变异（这仍然使渲染本身变得纯净）。

```javascript
let count = 0;

let children = items.map(item => {
  count++;
  return <Item item={item} key={item.id} />;
});

let header = <Header>Number of items {count}</Header>;
```

​	我不能在我的代码中只改变children和header的顺序。

​	hooks不关心使用的顺序，它关系是否有持续每次都一样的顺序。这与调用之间隐含的依赖性非常不同。

​	最好不要依赖持久秩序 - 所有事情都是平等的。 但是，有一些权衡。 例如。 语法噪音或其他令人困惑的事情。

​	Some think that it is worth the cost for puritism reasons alone. However, some also have practical concerns.



## API设计

### useReducer

```javascript
const initialState = {count: 0};

function reducer(state, action) {
  switch (action.type) {
    case 'reset':
      return initialState;
    case 'increment':
      return {count: state.count + 1};
    case 'decrement':
      return {count: state.count - 1};
    default:
      // A reducer must always return a valid state.
      // Alternatively you can throw an error if an invalid action is dispatched.
      return state;
  }
}

function Counter({initialCount}) {
  const [state, dispatch] = useReducer(reducer, {count: initialCount});
  return (
    <>
      Count: {state.count}
      <button onClick={() => dispatch({type: 'reset'})}>
        Reset
      </button>
      <button onClick={() => dispatch({type: 'increment'})}>+</button>
      <button onClick={() => dispatch({type: 'decrement'})}>-</button>
    </>
  );
}
```

这个会替换Redux吗？这回加重学习flux的负担吗？一般来说比起很多flux框架，Reducer是一个更狭隘的用例，Reducer非常简单，但是，如果你在学习Vue，Reason，Elm等框架/语言，调度和集中逻辑以在更高级别的状态之间转换的这种一般模式似乎取得了巨大成功。它还解决了React中带有回调的许多怪癖，为复杂的状态转换带来了更多直观的解决方案。特别是在并行（concurrent）的世界中。

从代码体积上看，他不会增加任何非当前必须的代码，从概念上，我认为这是一个值得学习的概念，因为相同的模式不断以各种形式出现在各处。 最好有一个中央API来管理它。

所以我认为比起useState，useReducer是更加核心的API。但是useState依然很棒因为对于简单的用例来说它非常简洁而且简易解释，不过大家应该尽早研究useReducer或其他相似的模式。

也就是说，它也没有做Redux和其他Flux框架所做的很多事情。通常我认为你不会需要它，所以它可能不像现在那样普遍存在，但它仍然存在。

### Context Provider



### useEffect

目前最奇怪的Hook是`useEffect`。需要明确的是，预计这是迄今为止最难使用的Hook，因为它正在使用命令式代码（interoping with imperative code）。命令式代码很难管理，这就是为什么我们试图保持声明式代码。但是，从声明式变为命令式很难，因为声明式可以处理更多不同类型的状态和每行代码的转换。 实现效果时，理想情况下也应处理所有这些情况。 这里的部分目标是鼓励处理更多情况。 如果这样做，那么一些怪癖是可以的。