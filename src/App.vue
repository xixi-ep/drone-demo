<template>
  <div class="dashboard-container">
    <el-row :gutter="20">
      <!-- 左侧：控制台与视图区 -->
      <el-col :span="16">
        <el-card class="box-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>📹 视觉检测中控台</span>
              <el-tag :type="isBatching ? 'warning' : 'success'" effect="dark">
                {{ isBatching ? '批量处理中...' : '空闲/实时监控' }}
              </el-tag>
            </div>
          </template>    
          
          <div class="control-panel" style="margin-bottom: 15px;">
            <el-upload
              action="#"
              :auto-upload="false"
              multiple
              :show-file-list="false"
              :on-change="handleFileChange"
              accept="image/*,video/*"
              style="display: inline-block; margin-right: 15px;"
            >
              <el-button type="primary" plain>上传文件 (支持多选)</el-button>
            </el-upload>
            <el-button type="success" plain>开启实时摄像头</el-button>
            <el-button type="danger" :disabled="!isBatching" @click="stopBatch">停止检测</el-button>      
            
            <div class="slider-block">
              <span class="slider-title">阈值 ({{ confidenceThreshold }}%)</span>
              <el-slider v-model="confidenceThreshold" :step="5" style="width: 120px;" />
            </div>
          </div>

          <el-progress 
            v-if="fileList.length > 1" 
            :percentage="processedPercentage" 
            :format="progressFormat" 
            style="margin-bottom: 15px;"
          />
          
          <div class="video-container">
            <img :src="currentPreviewUrl" alt="Main View" class="video-stream" />
          </div>
          
          <el-scrollbar v-if="fileList.length > 1" class="thumbnail-scrollbar">
            <div class="thumbnail-list">
              <div 
                v-for="(file, index) in fileList" 
                :key="index"
                class="thumbnail-item"
                :class="{ 'is-active': currentIndex === index }"
                @click="selectFile(index)"
              >
                <img :src="file.previewUrl" class="thumb-img" />
                <div v-if="file.status === 'done'" class="status-badge success">✔</div>
                <div v-if="file.status === 'pending'" class="status-badge pending">⏳</div>
              </div>
            </div>
          </el-scrollbar>
        </el-card>
      </el-col>

      <!-- 右侧：数据面板区 -->
      <el-col :span="8">
        <el-card class="box-card" shadow="hover" style="height: 100%;">
          <template #header>
            <div class="card-header">
              <span>📊 数据面板</span>
            </div>
          </template>
          
          <!-- 维度1：全局统计 (Global) -->
          <div class="section-title">🌍 全局任务进度</div>
          <el-row :gutter="10" class="stats-row">
            <el-col :span="12">
              <el-statistic title="任务总进度" :value="processedCount">
                <template #suffix> / {{ fileList.length }} 张</template>
              </el-statistic>
            </el-col>
            <el-col :span="12">
              <el-statistic title="系统处理性能" :value="isBatching ? 25 : 0" suffix=" FPS" />
            </el-col>
          </el-row>

          <el-divider border-style="dashed" />

          <!-- 维度2：局部统计 (Local - 当前选中图片) -->
          <div class="section-title">
            🔍 当前视图分析 
            <span class="sub-text">(图 {{ currentIndex + 1 }})</span>
          </div>
          <el-row :gutter="10" class="stats-row" style="margin-bottom: 10px;">
            <el-col :span="24">
              <el-statistic title="当前画面目标总数" :value="currentTargetCount" />
            </el-col>
          </el-row>

          <!-- 表格：只显示当前选中图片的检测结果 -->
          <el-table 
            :data="currentTargetList" 
            height="320" 
            style="width: 100%" 
            size="small" 
            stripe
            empty-text="该图片尚未处理或未检测到目标"
          >
            <el-table-column prop="timestamp" label="时间" width="85" />
            <el-table-column prop="category" label="类别" width="80">
              <template #default="scope">
                <el-tag :type="scope.row.category === 'Car' ? 'success' : 'danger'" size="small">
                  {{ scope.row.category }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="confidence" label="置信度" width="70" />
            <el-table-column prop="coords" label="坐标(x,y,w,h)" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 底部：P-R曲线图 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :span="24">
        <el-card class="box-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>📈 算法评估指标 (P-R Curve & AP)</span>
            </div>
          </template>
          <div ref="prChartRef" style="width: 100%; height: 350px;"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<!-- <script setup>
import { ref, computed, onMounted } from 'vue'
import * as echarts from 'echarts'

const confidenceThreshold = ref(80)

// ==========================================
// 状态与数据管理
// ==========================================
const fileList = ref([]) 
const currentIndex = ref(0) 
const isBatching = ref(false) 
const processedCount = ref(0) 

// 进度条文本格式化
const processedPercentage = computed(() => {
  if (fileList.value.length === 0) return 0
  return Math.floor((processedCount.value / fileList.value.length) * 100)
})
const progressFormat = () => `${processedCount.value} / ${fileList.value.length}`

// 当前主视图显示的图片 URL
const currentPreviewUrl = computed(() => {
  if (fileList.value.length === 0) {
    return 'https://via.placeholder.com/800x450/333/fff?text=Waiting+for+Video/Image...'
  }
  return fileList.value[currentIndex.value]?.previewUrl || ''
})

// ★★★ 核心修改 1：获取当前选中图片的检测结果列表 ★★★
const currentTargetList = computed(() => {
  if (fileList.value.length === 0) return []
  // 返回当前选中索引图片的 detections 数组，如果没有则返回空数组
  return fileList.value[currentIndex.value]?.detections || []
})

// ★★★ 核心修改 2：获取当前选中图片的目标数量 ★★★
const currentTargetCount = computed(() => {
  return currentTargetList.value.length
})

// ==========================================
// 操作逻辑
// ==========================================
const handleFileChange = (uploadFile, uploadFiles) => {
  fileList.value = uploadFiles.map((f, i) => ({
    name: f.name,
    raw: f.raw,
    // 使用假网图，且保证每张图长得不一样 (random参数)
    previewUrl: `https://picsum.photos/800/450?random=${i}`, 
    status: 'pending',
    detections: [] // ★ 新增：为每张图片预留一个独立的检测结果数组
  }))  
  currentIndex.value = 0 
  
  if (fileList.value.length > 1) {
    startBatchProcessing()
  }
}

// 用户手动点击缩略图
const selectFile = (index) => {
  currentIndex.value = index
  // 点击后，因为 currentTargetList 是 computed 属性，右侧表格和统计数据会自动刷新！
}

let batchTimer = null 
const startBatchProcessing = () => {
  isBatching.value = true
  processedCount.value = 0  
  
  batchTimer = setInterval(() => {
    if (processedCount.value < fileList.value.length) {
      // 获取当前正在处理的图片对象
      const currentProcessingFile = fileList.value[processedCount.value]
      
      // ★ 模拟算法检测过程：生成针对这单张图片的假数据
      const mockDetections = generateMockDetections()
      
      // 将数据保存到该图片对象中，并标记为完成
      currentProcessingFile.detections = mockDetections
      currentProcessingFile.status = 'done' 
      
      processedCount.value++
      
      // 可选交互体验：如果用户没有在手动查看其他图，主视图自动跟随最新处理的进度跳转
      // 如果你希望用户可以自由查看不被打扰，可以把下面这行注释掉
      currentIndex.value = processedCount.value - 1 
      
    } else {
      clearInterval(batchTimer)
      isBatching.value = false 
    }
  }, 1500) // 1.5秒处理一张
}

const stopBatch = () => {
  isBatching.value = false
  if (batchTimer) clearInterval(batchTimer) 
}

// ★ 生成模拟检测数据的辅助函数
const generateMockDetections = () => {
  const list = []
  // 随机生成 1 到 6 个目标
  const targetCount = Math.floor(Math.random() * 6) + 1 
  
  for (let i = 0; i < targetCount; i++) {
    const isCar = Math.random() > 0.4 // 60%概率是车，40%是人
    const timeNow = new Date().toLocaleTimeString('en-US', { hour12: false })
    
    list.push({
      timestamp: timeNow,
      category: isCar ? 'Car' : 'Person',
      confidence: (Math.random() * 15 + 85).toFixed(1) + '%', // 85% - 100% 随机置信度
      coords: `[${Math.floor(Math.random() * 500)}, ${Math.floor(Math.random() * 300)}, 60, 30]`
    })
  }
  return list
}

// ==========================================
// ECharts 初始化 (保持不变)
// ==========================================
const prChartRef = ref(null)
onMounted(() => {
  initPRChart()
})
const initPRChart = () => {
  const chart = echarts.init(prChartRef.value)
  const option = {
    title: { text: 'Precision-Recall Curve (Mock)', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['Car (AP: 0.92)', 'Person (AP: 0.85)'], bottom: 0 },
    xAxis: { type: 'value', name: 'Recall', min: 0, max: 1 },
    yAxis: { type: 'value', name: 'Precision', min: 0, max: 1 },
    series: [
      {
        name: 'Car (AP: 0.92)',
        type: 'line',
        smooth: true,
        data: [[0, 1], [0.2, 0.99], [0.4, 0.97], [0.6, 0.95], [0.8, 0.88], [0.9, 0.70], [1, 0]]
      },
      {
        name: 'Person (AP: 0.85)',
        type: 'line',
        smooth: true,
        data: [[0, 1], [0.2, 0.95], [0.4, 0.90], [0.6, 0.85], [0.8, 0.75], [0.9, 0.50], [1, 0]]
      }
    ]
  }
  chart.setOption(option)  
  window.addEventListener('resize', () => {
    chart.resize()
  })
}
</script> -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import * as echarts from 'echarts'
import axios from 'axios' // ★ 新增：引入 Axios 用于网络请求

const confidenceThreshold = ref(80)

// ==========================================
// 状态与数据管理
// ==========================================
const fileList = ref([]) 
const currentIndex = ref(0) 
const isBatching = ref(false) 
const processedCount = ref(0) 

// 进度条文本格式化
const processedPercentage = computed(() => {
  if (fileList.value.length === 0) return 0
  return Math.floor((processedCount.value / fileList.value.length) * 100)
})
const progressFormat = () => `${processedCount.value} / ${fileList.value.length}`

// 当前主视图显示的图片 URL
const currentPreviewUrl = computed(() => {
  if (fileList.value.length === 0) {
    return 'https://via.placeholder.com/800x450/333/fff?text=Waiting+for+Video/Image...'
  }
  return fileList.value[currentIndex.value]?.previewUrl || ''
})

// 获取当前选中图片的检测结果列表
const currentTargetList = computed(() => {
  if (fileList.value.length === 0) return []
  return fileList.value[currentIndex.value]?.detections || []
})

// 获取当前选中图片的目标数量
const currentTargetCount = computed(() => {
  return currentTargetList.value.length
})

// 存储所有活跃的 WebSocket 实例，方便后续清理
const activeWebSockets = ref(new Map())

// ==========================================
// 操作逻辑 (真实联调版)
// ==========================================
const handleFileChange = async (uploadFile, uploadFiles) => {
  // 1. 初始化文件列表
  fileList.value = uploadFiles.map((f) => ({
    name: f.name,
    raw: f.raw,
    // ★ 核心修改：使用浏览器原生 API 直接读取本地文件作为初始预览图，告别假网图！
    previewUrl: URL.createObjectURL(f.raw), 
    status: 'pending', // 状态：pending, processing, done, error
    detections: [], 
    taskId: null // 预留字段：存放后端返回的任务ID
  }))  
  
  currentIndex.value = 0 
  
  if (fileList.value.length > 0) {
    startRealBatchProcessing()
  }
}

// 用户手动点击缩略图
const selectFile = (index) => {
  currentIndex.value = index
}

// ★★★ 核心方法：真实请求后端的批量处理逻辑 ★★★
const startRealBatchProcessing = async () => {
  isBatching.value = true
  processedCount.value = 0  
  
  // 遍历所有上传的文件，逐一（或并发）发给后端
  for (let i = 0; i < fileList.value.length; i++) {
    const currentFile = fileList.value[i]
    currentFile.status = 'processing'
    
    try {
      // 1. 构造表单数据
      const formData = new FormData()
      formData.append('file', currentFile.raw) // 确保与后端 @RequestParam("file") 名称一致
      
      // 2. 调用上传接口 (POST /api/upload)
      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      // 假设后端返回的数据格式包含 taskId，例如: { code: 200, data: { taskId: "12345" } }
      // （⚠️ 请根据 Java 后端实际返回的 JSON 结构调整这里的内容）
      const taskId = response.data.taskId || response.data.data?.taskId 
      currentFile.taskId = taskId
      
      // 3. 拿到 taskId 后，立刻为这个文件建立 WebSocket 连接，接收实时检测数据
      if (taskId) {
        connectWebSocket(taskId, currentFile)
      }
      
    } catch (error) {
      console.error(`文件 ${currentFile.name} 上传失败:`, error)
      currentFile.status = 'error'
      processedCount.value++ // 报错也算处理完一张，防止进度条卡死
    }
  }
}

// ★★★ 核心方法：建立 WebSocket 接收算法结果 ★★★
const connectWebSocket = (taskId, fileObj) => {
  // 连接后端的 WS 接口 (依赖 vite.config.js 的代理)
  const wsUrl = `ws://${window.location.host}/ws/${taskId}`
  const ws = new WebSocket(wsUrl)
  
  // 保存 WS 实例以便随时断开
  activeWebSockets.value.set(taskId, ws)

  ws.onopen = () => {
    console.log(`📡 WebSocket 开启，任务ID: ${taskId}`)
  }

  ws.onmessage = (event) => {
    try {
      const resultData = JSON.parse(event.data)
      console.log(`任务 ${taskId} 收到数据:`, resultData)
      
      // 假设后端推送来的是单个目标的检测结果
      // （⚠️ 需根据 Java/Python 实际推送的 JSON 字段调整，这里做了一个通用映射）
      if (resultData.category && resultData.confidence) {
        fileObj.detections.push({
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          category: resultData.category,
          confidence: resultData.confidence,
          coords: resultData.coords || '[坐标未知]'
        })
      }
      
      // 判断后端是否通知该图片已处理完毕 (假设后端会发一个 { status: "completed" })
      if (resultData.status === 'completed' || resultData.msg === 'EOF') {
        finishFileProcessing(taskId, fileObj)
      }
      
    } catch (error) {
      console.error('解析 WebSocket 数据失败:', error)
    }
  }

  ws.onclose = () => {
    console.log(`🔌 WebSocket 关闭，任务ID: ${taskId}`)
    activeWebSockets.value.delete(taskId)
  }

  ws.onerror = (error) => {
    console.error(`❌ WebSocket 错误，任务ID: ${taskId}`, error)
  }
}

// 处理单张图片完成的逻辑
const finishFileProcessing = (taskId, fileObj) => {
  fileObj.status = 'done'
  
  // ★ 核心联动：将预览图替换为后端画好检测框的处理后图片 (GET /api/download/{taskId})
  // 加上时间戳防止浏览器缓存
  fileObj.previewUrl = `/api/download/${taskId}?t=${new Date().getTime()}`
  
  processedCount.value++
  
  // 主动关闭 WS 连接，节省资源
  const ws = activeWebSockets.value.get(taskId)
  if (ws) ws.close()
  
  // 检查是否全部处理完毕
  if (processedCount.value === fileList.value.length) {
    isBatching.value = false
  }
}

// 停止所有任务
const stopBatch = () => {
  isBatching.value = false
  // 断开所有活跃的 WebSocket 连接
  activeWebSockets.value.forEach((ws, taskId) => {
    ws.close()
    console.log(`强制停止任务: ${taskId}`)
  })
  activeWebSockets.value.clear()
}


// ==========================================
// ECharts 初始化 (保持不变)
// ==========================================
const prChartRef = ref(null)
onMounted(() => {
  initPRChart()
})
const initPRChart = () => {
  const chart = echarts.init(prChartRef.value)
  const option = {
    title: { text: 'Precision-Recall Curve (Mock)', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['Car (AP: 0.92)', 'Person (AP: 0.85)'], bottom: 0 },
    xAxis: { type: 'value', name: 'Recall', min: 0, max: 1 },
    yAxis: { type: 'value', name: 'Precision', min: 0, max: 1 },
    series: [
      {
        name: 'Car (AP: 0.92)',
        type: 'line',
        smooth: true,
        data: [[0, 1], [0.2, 0.99], [0.4, 0.97], [0.6, 0.95], [0.8, 0.88], [0.9, 0.70], [1, 0]]
      },
      {
        name: 'Person (AP: 0.85)',
        type: 'line',
        smooth: true,
        data: [[0, 1], [0.2, 0.95], [0.4, 0.90], [0.6, 0.85], [0.8, 0.75], [0.9, 0.50], [1, 0]]
      }
    ]
  }
  chart.setOption(option)  
  window.addEventListener('resize', () => {
    chart.resize()
  })
}
</script>
<style scoped>
/* 基础样式保持不变 */
.dashboard-container {
  padding: 20px;
  background-color: #f0f2f5;
  min-height: 100vh;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}
.mt-20 { margin-top: 20px; }

.video-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background-color: #000;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 20px;
}
.video-stream {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.control-panel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}
.slider-block {
  flex: 1;
  min-width: 200px;
  margin-left: 20px;
}
.slider-title {
  font-size: 13px;
  color: #606266;
}

/* ★ 右侧面板新样式 */
.section-title {
  font-size: 14px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 15px;
  padding-left: 5px;
  border-left: 4px solid #409EFF;
}
.sub-text {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}
.stats-row {
  margin-bottom: 10px;
  text-align: center;
}

/* 缩略图画廊样式 */
.thumbnail-scrollbar {
  margin-top: 15px;
  width: 100%;
  border-top: 1px solid #ebeef5;
  padding-top: 15px;
}
.thumbnail-list {
  display: flex;
  gap: 10px;
}
.thumbnail-item {
  position: relative;
  width: 100px;
  height: 60px;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.3s;
  flex-shrink: 0;
  overflow: hidden;
}
.thumbnail-item.is-active {
  border-color: #409EFF; 
  transform: scale(1.05);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.2);
}
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.status-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  color: white;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 10px;
}
.status-badge.success { background: #67C23A; }
.status-badge.pending { background: #E6A23C; }
</style>
