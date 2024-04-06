# 喜马拉雅专辑批量下载小工具

## 程序的编写思路
把需要下载的对象抽象为有限状态机，包含音频文件信息的json文件、m4a和mp3文件之间存在着一种转化关系
![思路](https://www.callmewing.com/2017/08/09/%E6%89%B9%E9%87%8F%E4%B8%8B%E8%BD%BD%E5%96%9C%E9%A9%AC%E6%8B%89%E9%9B%85%E7%9A%84%E5%85%8D%E8%B4%B9%E4%B8%93%E8%BE%91/state.png)

[具体设计思路👇](https://www.callmewing.com/2017/08/09/%E6%89%B9%E9%87%8F%E4%B8%8B%E8%BD%BD%E5%96%9C%E9%A9%AC%E6%8B%89%E9%9B%85%E7%9A%84%E5%85%8D%E8%B4%B9%E4%B8%93%E8%BE%91/)

## 前提

安装 NodeJS

https://nodejs.org/en/

## 使用

命令行

```bash
npm i
node index.js https://www.ximalaya.com/album/4264862 目录(可选)
```
