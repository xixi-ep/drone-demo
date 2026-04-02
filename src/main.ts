import { createApp } from 'vue'
// @ts-ignore
import App from './App.vue'

// 1. 引入 Element Plus 核心组件
import ElementPlus from 'element-plus'
// 2. 引入 Element Plus 的全局样式（这行必不可少，否则组件没有样式）
import 'element-plus/dist/index.css'

// 3. 引入你刚刚安装的 Element Plus 图标库
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

const app = createApp(App)

// 4. 全局注册所有图标（这样你在任何页面都能直接使用图标组件，比如 <el-icon><VideoCamera /></el-icon>）
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 5. 告诉 Vue 实例使用 Element Plus 插件
app.use(ElementPlus)

// 6. 挂载到 HTML 中 id 为 app 的 div 上
app.mount('#app')
