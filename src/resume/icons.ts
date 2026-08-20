export const iconCategories = [
  { id: 'personal', name: '个人与生活', english: 'Personal' },
  { id: 'social', name: '联系与社交', english: 'Contact and social' },
  { id: 'work', name: '职业与成果', english: 'Work and achievements' },
  { id: 'education', name: '教育与研究', english: 'Education and research' },
  { id: 'technology', name: '技术与工具', english: 'Technology and tools' },
] as const;

export type IconCategory = (typeof iconCategories)[number]['id'];

const catalogGroups = {
  personal: [
    ['none', '无图标', 'No icon', 'empty hide 无 隐藏'],
    ['user', '个人', 'Person', 'name profile 姓名 资料'],
    ['pin', '位置', 'Location', 'address city 地址 城市'],
    ['calendar', '日期', 'Date', 'birthday schedule 生日 日程'],
    ['home', '居住', 'Home', 'residence house 家 住址'],
    ['heart', '兴趣', 'Interests', 'hobby favorite 爱好 喜爱'],
    ['languages', '语言', 'Languages', 'translation bilingual 翻译 双语'],
    ['music', '音乐', 'Music', 'instrument audio 乐器 声音'],
    ['camera', '摄影', 'Photography', 'photo picture 照片 图像'],
    ['palette', '艺术', 'Art', 'design painting 设计 绘画'],
    ['plane', '旅行', 'Travel', 'international flight 国际 航空'],
    ['accessibility', '无障碍', 'Accessibility', 'inclusion access 包容 便利'],
    ['leaf', '环保', 'Environment', 'sustainability nature 可持续 自然'],
  ],
  social: [
    ['mail', '邮箱', 'Email', 'contact inbox 联系 邮件'],
    ['phone', '电话', 'Phone', 'mobile call 手机 通话'],
    ['globe', '网站', 'Website', 'web internet homepage 主页 互联网'],
    ['link', '链接', 'Link', 'url address 网址 地址'],
    ['message', '消息', 'Message', 'chat communication 聊天 沟通'],
    ['github', 'GitHub', 'GitHub', 'repository open source 开源 仓库'],
    ['linkedin', 'LinkedIn', 'LinkedIn', 'network career 领英 人脉'],
    ['rss', '博客订阅', 'Blog feed', 'rss writing 文章 写作'],
    ['video', '视频', 'Video', 'channel meeting 频道 会议'],
    ['podcast', '播客', 'Podcast', 'broadcast audio 广播 音频'],
    ['at-sign', '社交账号', 'Social handle', 'username account 用户名 账户'],
    ['qr-code', '二维码', 'QR code', 'scan contact 扫码 联系'],
  ],
  work: [
    ['briefcase', '工作', 'Work', 'job employment 职业 就业'],
    ['building', '公司', 'Company', 'business organization 企业 组织'],
    ['users', '团队', 'Team', 'people collaboration 人员 协作'],
    ['award', '奖项', 'Award', 'honor recognition 荣誉 表彰'],
    ['trophy', '竞赛', 'Competition', 'winner contest 冠军 比赛'],
    ['target', '目标', 'Goal', 'objective milestone 规划 里程碑'],
    ['chart', '业绩', 'Performance', 'analytics growth 数据 增长'],
    ['presentation', '演讲', 'Presentation', 'speaker slides 演示 报告'],
    ['clipboard', '项目管理', 'Project management', 'planning tasks 计划 任务'],
    ['handshake', '合作', 'Partnership', 'agreement client 协议 客户'],
    ['badge-check', '资质', 'Qualification', 'certified verified 认证 审核'],
    ['compass', '职业方向', 'Career direction', 'strategy path 战略 路径'],
    ['lightbulb', '创新', 'Innovation', 'idea invention 创意 发明'],
    ['clock', '时间', 'Time', 'experience duration 经验 时长'],
  ],
  education: [
    ['graduation', '教育', 'Education', 'degree school 学位 学校'],
    ['book', '出版物', 'Publication', 'paper journal 论文 期刊'],
    ['library', '图书馆', 'Library', 'reading collection 阅读 馆藏'],
    ['school', '院校', 'School', 'university college 大学 学院'],
    ['notebook', '课程', 'Course', 'learning notes 学习 笔记'],
    ['microscope', '科研', 'Research', 'science lab 研究 科学 实验室'],
    ['flask', '实验', 'Experiment', 'chemistry test 化学 测试'],
    ['atom', '物理', 'Physics', 'science theory 科学 理论'],
    ['calculator', '数学', 'Mathematics', 'statistics calculation 统计 计算'],
    ['pen', '学术写作', 'Academic writing', 'author manuscript 作者 文稿'],
    ['certificate', '证书', 'Certificate', 'diploma training 文凭 培训'],
    ['brain', '知识', 'Knowledge', 'cognition learning 认知 学习'],
  ],
  technology: [
    ['code', '代码', 'Code', 'programming developer 编程 开发'],
    ['terminal', '命令行', 'Terminal', 'shell console 脚本 控制台'],
    ['database', '数据库', 'Database', 'sql storage 数据 存储'],
    ['server', '服务器', 'Server', 'backend hosting 后端 托管'],
    ['cloud', '云计算', 'Cloud computing', 'infrastructure devops 基础设施 运维'],
    ['cpu', '处理器', 'Processor', 'hardware chip 硬件 芯片'],
    ['monitor', '桌面应用', 'Desktop application', 'computer display 电脑 显示器'],
    ['smartphone', '移动应用', 'Mobile application', 'android ios 手机 移动端'],
    ['git-branch', '版本管理', 'Version control', 'git branch 分支 版本'],
    ['shield', '安全', 'Security', 'privacy protection 隐私 防护'],
    ['network', '网络', 'Network', 'connection system 连接 系统'],
    ['wrench', '工具', 'Tools', 'engineering maintenance 工程 维护'],
    ['bot', '人工智能', 'Artificial intelligence', 'ai machine learning 机器学习 智能'],
    ['workflow', '自动化', 'Automation', 'pipeline process 流程 工作流'],
  ],
} as const satisfies Record<IconCategory, readonly (readonly [string, string, string, string])[]>;

export const iconCatalog = Object.entries(catalogGroups).flatMap(([category, choices]) =>
  choices.map(([id, name, english, keywords]) => ({
    id,
    name,
    english,
    keywords,
    category: category as IconCategory,
  })),
);

export type ResumeIcon = (typeof iconCatalog)[number]['id'];
export const iconIds = iconCatalog.map((icon) => icon.id);
const validIcons = new Set<string>(iconIds);

export const defaultFieldIcons: Record<string, ResumeIcon> = {
  name: 'user',
  headline: 'briefcase',
  email: 'mail',
  phone: 'phone',
  location: 'pin',
  website: 'globe',
};

export function isResumeIcon(value: unknown): value is ResumeIcon {
  return typeof value === 'string' && validIcons.has(value);
}

export function filterResumeIcons(query: string, category = 'all') {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return iconCatalog.filter((icon) => {
    if (category !== 'all' && icon.category !== category) return false;
    const group = iconCategories.find((candidate) => candidate.id === icon.category)!;
    const text =
      `${icon.id} ${icon.name} ${icon.english} ${icon.keywords} ${group.name} ${group.english}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
