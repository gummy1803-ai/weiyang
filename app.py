# -*- coding: utf-8 -*-
"""Streamlit Cloud 入口页 —— 粒子星系 · 手势控制

部署(Streamlit Community Cloud):
  仓库选择本仓库,主文件 app.py 即可。
  三维主应用位于 static/ 目录,由 Streamlit 内置静态托管服务:
      https://<app-url>/static/galaxy.html
"""
import streamlit as st

st.set_page_config(
    page_title="粒子星系 · 手势控制",
    page_icon="🌌",
    layout="centered",
)

GAME_URL = "static/galaxy.html"  # 相对链接:同源跳转,天然 HTTPS

# ---------- 标题区 ----------
st.markdown(
    """
    <h1 style="text-align:center;margin-bottom:0">🌌 粒子星系</h1>
    <p style="text-align:center;color:#aaa;margin-top:4px">
        摄像头手势控制的三维黑洞星系 · Three.js + MediaPipe
    </p>
    """,
    unsafe_allow_html=True,
)

# ---------- 进入按钮 ----------
st.link_button("🚀 进入星系(需允许摄像头)", GAME_URL, use_container_width=True)
st.caption("若按钮无效或想新窗口打开:在地址栏应用域名后拼接 /static/galaxy.html")

st.divider()

# ---------- 玩法说明 ----------
left, right = st.columns(2)
with left:
    st.markdown("#### 🖐 通用手势")
    st.markdown(
        """
        - **旋转拳头**: 水平/垂直旋转视角
        - **握拳/张开**: 远离 / 靠近
        - **拖拽/滚轮**: 旋转 / 缩放(鼠标兜底)
        """
    )
with right:
    st.markdown("#### 🕳 卡冈图雅专属")
    st.markdown(
        """
        - **点击黑洞**: 聚焦并查看简介
        - **点击黑洞3次**: 星系形成9阶段
        - **按键4/3**: 进入/退出黑洞内部
        - **按键1/2**: 亮度降低/升高
        """
    )

st.info(
    "☁️ **云端离线说明**:静态托管环境下验证码为前端自验、访问统计暂不可用,"
    "不影响进入与全部玩法;完整统计请用本地模式。",
    icon="ℹ️",
)

# ---------- 本地模式 ----------
st.markdown("#### 💻 本地完整模式(含访问统计)")
st.code("git clone https://github.com/gummy1803-ai/weiyang.git", language="bash")
st.code(
    "pip install flask\n"
    "python server.py\n"
    "# 打开 http://localhost:8080/galaxy.html",
    language="python",
)

# ---------- 技术栈 ----------
st.divider()
st.caption(
    "Three.js 渲染 · MediaPipe Hands 手势识别 · OGL 进入背景 · "
    "Flask + SQLite 访问统计 · Streamlit 部署入口"
)
