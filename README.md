@author:yhoodie  
@date:2026-08-27  
@LICENSE:MIT
# 你可能想了解的
## 这是什么  
### 界面预览
<https://app-dysgncsaheyp.appmiaoda.com/embed>
### 项目简介   
这是一个数字水印嵌入和提取工具，可对图像、音频、视频三种载体批量嵌入文字、图像、音频、视频四种类型的水印，上传载体后会显示当前载体的最小水印容量，超过可嵌入水印大小将会截断水印。水印可调强度
### 项目结构

```
├── README.md             # 说明文档
├── components.json       # 组件库配置
├── index.html            # 入口文件
├── package.json          # 包管理
├── postcss.config.js     # postcss 配置
├── public                # 静态资源目录
│   ├── favicon.png       # 图标
│   └── images            # 图片资源
├── src                   # 源码目录
│   ├── App.tsx           # 入口文件
│   ├── components        # 组件目录
│   ├── contexts          # 上下文目录
│   ├── db                # 数据库配置目录
│   ├── hooks             # 通用钩子函数目录
│   ├── index.css         # 全局样式
│   ├── layout            # 布局目录
│   ├── lib               # 工具库目录
│   ├── main.tsx          # 入口文件
│   ├── routes.tsx        # 路由配置
│   ├── pages             # 页面目录
│   ├── services          # 数据库交互目录
│   └── types             # 类型定义目录
├── tsconfig.app.json     # ts 前端配置文件
├── tsconfig.json         # ts 配置文件
├── tsconfig.node.json    # ts node端配置文件
└── vite.config.ts        # vite 配置文件
```

### 技术栈

Vite、TypeScript、React、Supabase

## 本地开发

### 环境要求

```
# Node.js ≥ 20
# npm ≥ 10
例如：
# node -v   # v20.18.3
# npm -v    # 10.8.2
```

具体安装步骤如下：

### 在 Windows 上安装 Node.js

```
# Step 1: 访问Node.js官网：https://nodejs.org/，点击下载后，会根据你的系统自动选择合适的版本（32位或64位）。
# Step 2: 运行安装程序：下载完成后，双击运行安装程序。
# Step 3: 完成安装：按照安装向导完成安装过程。
# Step 4: 验证安装：在命令提示符（cmd）或IDE终端（terminal）中输入 node -v 和 npm -v 来检查 Node.js 和 npm 是否正确安装。
```

### 在 macOS 上安装 Node.js

```
# Step 1: 使用Homebrew安装（推荐方法）：打开终端。输入命令brew install node并回车。如果尚未安装Homebrew，需要先安装Homebrew，
可以通过在终端中运行如下命令来安装：
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
或者使用官网安装程序：访问Node.js官网。下载macOS的.pkg安装包。打开下载的.pkg文件，按照提示完成安装。
# Step 2: 验证安装：在命令提示符（cmd）或IDE终端（terminal）中输入 node -v 和 npm -v 来检查 Node.js 和 npm 是否正确安装。
```

### 安装完后按照如下步骤操作：

```
# Step 1: 下载代码包
# Step 2: 解压代码包
# Step 3: 用IDE打开代码包，进入代码目录
# Step 4: IDE终端输入命令行，安装依赖：npm i
# Step 5: IDE终端输入命令行，启动开发服务器：npm run dev -- --host 127.0.0.1
```

### 如何开发后端服务？

配置环境变量，安装相关依赖
如需使用数据库，请使用 supabase 官方版本或自行部署开源版本的 Supabase

### 如何配置应用中的三方 API？

具体三方 API 调用方法，请参考帮助文档：[源码导出](https://cloud.baidu.com/doc/MIAODA/s/Xmewgmsq7)，了解更多详细内容。

# 我自己想记录的   
## 基本信息   
&emsp;&emsp;2026.8.26基于秒哒平台搭建。纯Vibe Coding，完全没看代码。   
## 项目背景   
&emsp;&emsp;详情参见[audio_watermark](https://github.com/yhoodie/audio_watermark)这个项目。本项目是基于[audio_watermark](https://github.com/yhoodie/audio_watermark)的复杂版本尝试。   
## 复盘总结   
&emsp;&emsp;第一部分的内容依然是秒哒平台自动生成内容的微调。除本文档外没改任何项目文件和结构。果然项目复杂以后问题就出现了，甚至没有做好基础测试就给我算完工了。我上来测第一个音频嵌入文字，还没开始攻击呢就无法提取了。对于复杂功能提示词还是需要要求给出测试方案，测试用例通过再进行交付。   
&emsp;&emsp;这次我的提示词也很简单：    
>做一个数字水印嵌入与提取系统。载体可以是图片、音频、视频；水印可以是文字、图片、音频、视频。需要支持批量处理和水印强度调节（设定可调整阈值，可使用水印分存技术等）。需要支持水印加解密，此功能可选，不输入密钥则不使用此功能。三个界面，一个嵌入，一个提取，还有一个界面模拟攻击方法，如格式转换、裁剪、噪声等。

比起prd文档，这个需求已经相当简略了，根据表现来看，加入交付前自测要求也许就能保证基本功能。不过自己发现了问题直接要求改bug，速度也很快，而且改完还给出了问题总结：   
>定位并修复了导致"未攻击直接提取也失败"的根因：加密水印的校验逻辑写反了——嵌入时 CRC 是对密文计算的，提取时即使输入了正确密钥，解密分支也永远走不到，所有带密钥的水印必然提取失败。已改为 CRC 对明文计算、先解密再校验，经自动化往返测试验证：正确密钥可提取，无密钥/错误密钥被正确拒绝。
>
>顺带用测试脚本逼出并修复了两个隐藏缺陷：音频分块从 2048 缩至 128 采样（原来 4 秒以内的音频容量为 0，根本嵌不进去）；Hann 窗未按均值归一化导致嵌入后块均值只有目标值一半，遇到含直流偏置的音频会判决翻转。同时优化了帧头冗余策略，小图片（200x150 从 0 提升到 32 字节）、短视频的可用容量明显提升。
>
>修复后 12 项往返测试全部通过：图片（明文/加密/噪声攻击/渐变图/小图）与音频（明文/加密/1 秒短音频/含直流偏置）均能正确提取，lint 校验通过。请重新嵌入一次水印再试——旧代码生成的加密文件无法被新逻辑兼容，需要重新嵌入。

从这个错误描述看来，基本逻辑还是容易出现问题的，不过这种测试能测出来的问题好改。如果是像[match_pair](https://github.com/yhoodie/match_pair)这个项目一样的纯逻辑计算又很难测试验证的，这样的黑盒式Vibe Coding就很难发现问题，除非出的问题非常蠢，定性的都一眼错，就像[match_pair](https://github.com/yhoodie/match_pair)这个项目最开始只是让AI帮算一样，因为结果过于离谱才自行编码把控逻辑。   
&emsp;&emsp;这个项目比较复杂，情况也比较多，时间有限，就不一一测试全面的情况了。