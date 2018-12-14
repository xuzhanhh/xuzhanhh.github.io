---
title: learning A Cartoon to Fiber
date: '2018-11-11'
spoiler: 学习记录
---

## 这里我还没写完

![image-20181110201732613](/Users/xuzhanhong1/Documents/image-20181110201732613.png)



![image-20181110202214457](/Users/xuzhanhong1/Documents/image-20181110202214457.png)



![image-20181110203945805](/var/folders/h5/1tnmsg713pldfgpyxh4c41wm0m7_pl/T/abnerworks.Typora/image-20181110203945805.png)

## stack reconciler的缺点

​	在我们执行update操作之前我们已经有一个在初始render时已经构造好的fiber树，react也会开始work-in-progress树并添加第一个fiber节点，因为我们不想当我们计算变动时直接修改dom，这个跟stack reconciler不一样，stack reconciler在往下走改变实例时同时改动当前的dom节点。

​	例如在将实例2变成4时，同时也会改动dom node从2到4在react计算第三个实例应该从3变到9前。

![image-20181110204749728](/var/folders/h5/1tnmsg713pldfgpyxh4c41wm0m7_pl/T/abnerworks.Typora/image-20181110204749728.png)

这样子是可行的如果你一次性同步地完成所有事情。如果你需要在两个实例间打断时，浏览器需要时间paint和layout，但是只有2变成4而3没有变成9，这样你的ui就会变得不连续。



## fiber phases

第一个阶段，react只会构建fiber tree和work-in-progress tree和变动列表（可中断）

第二阶段，将这些变动作用到dom上（不可中断）

![image-20181110205919129](/var/folders/h5/1tnmsg713pldfgpyxh4c41wm0m7_pl/T/abnerworks.Typora/image-20181110210012223.png)



## 阶段1

1. 当我们点击按钮时触发了setState

![image-20181110210205135](/Users/xuzhanhong1/Documents/image-20181110210205135.png)

2. 当setState被调用时，react会添加List组件一系列更新添加到更新队列中，然后react会开始调度这些工作![image-20181110210528429](/Users/xuzhanhong1/Documents/image-20181110210528429.png)

3. 使用request idle callback去延迟完成这些工作 

   ![image-20181110210741530](/Users/xuzhanhong1/Documents/image-20181110210741530.png)

   当主线程有空闲时间时会把具体剩余时间给react，具体几毫秒到几十毫秒（当最近的将来没有frame scheduled时）

   ![image-20181110211003501](/Users/xuzhanhong1/Documents/image-20181110211003501.png)

   ​	这样react可以使用这些剩余时间处理更新并当其他工作需要处理时将时间还给主线程。这样的操作需要跟踪两个时间，next unit of work that it needs to work on 和 主线程给与的剩余时间

   ![image-20181110211302791](/Users/xuzhanhong1/Documents/image-20181110211302791.png)

4. 从current复制HostRoot的数据到workInProgress tree 并添加一个指针指向儿子（List）

   ![image-20181110211949517](/Users/xuzhanhong1/Documents/image-20181110211949517.png)

5. 因为List本身没有更新，所以将List复制到workInProgress tree。并且List有更新队列，所以也会复制update Queue。

   ![image-20181110212258539](/Users/xuzhanhong1/Documents/image-20181110212258539.png)

6. 所以List fiber is going to be returned as the next unit of work![image-20181110212347964](/Users/xuzhanhong1/Documents/image-20181110212347964.png)

7. React 会检查deadline是否到来。因为还有剩余的时间，react会继续处理List![image-20181110212645386](/Users/xuzhanhong1/Documents/image-20181110212645386.png)

8. 因为List有更新队列，所以react会处理这些更新，他会调用updater函数，且传对象的setState以后的某个版本被移除![image-20181110212849733](/Users/xuzhanhong1/Documents/image-20181110212849733.png)并结束处理更新队列，fiber会标记一个tag表示他会修改dom树![image-20181110213110874](/Users/xuzhanhong1/Documents/image-20181110213110874.png)

9. 在继续往下处理前，我们需要知道List的children，所以react会在List实例设置props和state并调用render，我们会得到一个数组的元素。react会遍历这些元素去判断在current tree中是否有可以重用的fiber。如果有，则直接复制

   ![image-20181110213813900](/Users/xuzhanhong1/Documents/image-20181110213813900.png)

   ![image-20181110213944644](/Users/xuzhanhong1/Documents/image-20181110213944644.png)

10. 然后会返回List的第一个child button作为下一个unit of work, 然后react会回到work loop并检查deadline。![image-20181110214543420](/Users/xuzhanhong1/Documents/image-20181110214543420.png)![image-20181110214728829](/Users/xuzhanhong1/Documents/image-20181110214728829.png)

11. 这个时候用户想搞事情，点击放大字体按钮去改变web字体大小![image-20181110214856489](/var/folders/h5/1tnmsg713pldfgpyxh4c41wm0m7_pl/T/abnerworks.Typora/image-20181110214856489.png)

12. 这样会导致给队列中的一些东西添加了一个回调，主线程需要去关心的，但是不是马上因为react仍然有时间继续处理next unit of work -- button。button是我们第一个遇到的没有孩子的元素，所以他不会创建新的工作。所以react可以完成这个单位的工作，这意味着比较新旧元素查看是否有变动，如果有变动需要变动dom则会标记。然后因为button没有孩子，所以会返回邻居作为下一个单位的工作![image-20181110215513582](/Users/xuzhanhong1/Documents/image-20181110215513582.png)

13. react会结束这个单元的工作并回到work loop中检查deadline![image-20181110215657530](/Users/xuzhanhong1/Documents/image-20181110215657530.png)

14. item中有sCU，并且因为sCU返回false所以item1不需要对dom进行修改，所以不需要打标签。然后邻居作为下一个单元的工作。同样地，react回到work loop检查deadline并回来![image-20181110215823086](/Users/xuzhanhong1/Documents/image-20181110215823086.png)

15. 第二个item的sCU返回true，所以会被标记为有更变，然后他的div会被复制过来，并且将div返回作为下一个单元的工作 
    ![image-20181110220630861](/Users/xuzhanhong1/Documents/image-20181110220630861.png)![image-20181110220704324](/Users/xuzhanhong1/Documents/image-20181110220704324.png)

    

16.  因为我们还有一丢丢时间所以我们准备处理这个div，因为这个div没有children所以我们可以完成它，我们发现这个div的内容变更了，所以我们给他打上标记
    ![image-20181110222222665](/Users/xuzhanhong1/Documents/image-20181110222423364.png)

17. 因为当前没有邻居也没有children，没有下个单元的工作，所以会调用他父亲的complete，并且这是我们第一次将变动添加到一个列表，因为他有tag且完成了(completed)。
    ![image-20181110224035848](/Users/xuzhanhong1/Documents/image-20181110224035848.png)

18. 这个时候item也完成了(complated)并且他也有一个tag。so it's going to move itself up to it's going to start creating this list of changes on its parent. It merge its own list of changes into the parents effect list

19. item会将div的变动放到effect list的第一个，然后将自己放到effect list的末尾
    ![image-20181110224526544](/Users/xuzhanhong1/Documents/image-20181110224526544.png)

20. 第二个item complete 并返回邻居作为下一个单元的工作![image-20181110224637609](/Users/xuzhanhong1/Documents/image-20181110224637609.png)

    返回work loop，react发现deadline已经到了。所以react会释放资源并让主线程处理其他任务

    ![image-20181110224810666](/Users/xuzhanhong1/Documents/image-20181110224810666.png)

    react仍然需要继续完成任务，所以使用rIC让主线程完成工作后继续调用react

    ![image-20181110224939741](/Users/xuzhanhong1/Documents/image-20181110224939741.png)

    然后主线程会去处理等待中的callback，在这个例子中是layout

    ![image-20181110225030973](/Users/xuzhanhong1/Documents/image-20181110225030973.png)

    不过注意到nothing in the content of our react app is changed even though react note says going to need to change two to four 在将来的某个时间，而不是现在。

    

21. main thread 处理完其他事情会继续调用react，最后两个单元工作和第二个item一样

    ![image-20181110225617532](/Users/xuzhanhong1/Documents/image-20181110225617532.png)
    ![image-20181110225632116](/Users/xuzhanhong1/Documents/image-20181110225632116.png)

即完成了List下面的所有单元工作，所以List可以调用complete，并将自己和孩子的更变放到effect list中，然后HostRoot也完成了
![image-20181110225715325](/Users/xuzhanhong1/Documents/image-20181110230128716.png)
![image-20181110225807413](/Users/xuzhanhong1/Documents/image-20181110225807413.png)



22. react会将work-in-progress tree设成pending commit，这意味着第一个阶段结束了。我们更新了work-in-progress tree和指出了变动列表



## 阶段2

1. react 会检查deadline判断是否有时间立刻执行commit，如果不够则在rIC后第一时间commit这个pending commit![image-20181110230504330](/Users/xuzhanhong1/Documents/image-20181110230504330.png)
2. react会遍历effect list并应该更变到dom上，从第一个fiber开始

![image-20181110230821602](/Users/xuzhanhong1/Documents/image-20181110230821602.png)
![image-20181110230855909](/Users/xuzhanhong1/Documents/image-20181110230855909.png)
![image-20181110230913246](/Users/xuzhanhong1/Documents/image-20181110230913246.png)
item没有任何改变，因为我们不使用ref，不过如果我们在item中有ref will be detached now and then it would be reattached later
![image-20181110231153619](/Users/xuzhanhong1/Documents/image-20181110231153619.png)
![image-20181110231121156](/Users/xuzhanhong1/Documents/image-20181110231121156.png)
现在所有变动都在第一阶段计算完毕并commit到dom树。这意味着work-in-progress tree is actually a more up-to-date version of state of the app than the current tree，所以react需要修复current tree。他会切换指针，所以当前指针指向我们刚构建的work-in-pregress tree
![image-20181110231429089](/Users/xuzhanhong1/Documents/image-20181110231429089.png)
![image-20181110231630674](/Users/xuzhanhong1/Documents/image-20181110231630674.png)
这意味着react可以在work-in-progress tree中重用旧对象，只需要在下次构建中work-in-progress tree复制key value。这叫double buffering，可以在内存分配和gc中节省时间，现在react完成了这次的commit，并执行剩下的lifecycle hooks和更新任何refs并处理error boundaries
![image-20181110232043775](/Users/xuzhanhong1/Documents/image-20181110232043775.png)

## 优先级

```javascript
{
    "Synchronous": "same as stack rec",
    "Task": "before next tick",
    "Animation": "before next frame",
     "rIC":{
        	"High":"pretty soon",
            "Low":"如数据获取，对100or200ms不敏感",
			"Offscreen": "prep for display/scroll"
        }
}
```

高优先级的任务会立刻执行，尽管现在已经开始了低优先级的任务

![image-20181110232753533](/Users/xuzhanhong1/Documents/image-20181110232753533.png)

回到之前我们搞事情的地方，如果我们有一个紧急的font resize button
![image-20181110233032279](/Users/xuzhanhong1/Documents/image-20181110233032279.png)

用户点击后会放置一个callback到主线程处理队列中







## lifecycle hook during the phase

![image-20181111143014786](/Users/xuzhanhong1/Documents/image-20181111143014786.png)

![image-20181111143107194](/Users/xuzhanhong1/Documents/image-20181111143107194.png)



## starvation

reusing work where it can. So if it had a low priority work that was done and the high priority work didn't touch that part of the tree then they can reuse that work.

![image-20181111143219524](/Users/xuzhanhong1/Documents/image-20181111143219524.png)



## 相关资料

[effectTag](http://link.zhihu.com/?target=https%3A//github.com/facebook/react/blob/master/packages/shared/ReactSideEffectTags.js)

[react custom rIC](https://github.com/facebook/react/blob/0154a79fedef38a824a837c535bc853013dd4588/packages/react-scheduler/src/ReactScheduler.js#L25-L31)

