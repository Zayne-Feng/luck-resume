import { workspaceFeaturesEnglish } from './workspaceFeatures.ts';
import { workspaceToolsEnglish } from './workspaceTools.ts';
import { appearancePresets } from './appearancePresets.ts';
import { versionHistoryEnglish } from './versionHistory.ts';
import { layoutQualityEnglish } from './layoutQuality.ts';
import { workspaceBackupEnglish } from './workspaceBackup.ts';
import { aiEnglish } from './ai.ts';
import { mediaEnglish } from './media.ts';
import { editorOptionsEnglish } from './editorOptions.ts';
import { flexibleFieldEnglish } from './flexibleFields.ts';
import { advancedTextEnglish } from './advancedText.ts';
import { iconDiscoveryEnglish } from './iconDiscovery.ts';
import { editorFreedomEnglish } from './editorFreedom.ts';
import { entryTransferEnglish } from './entryTransfer.ts';
export const english: Record<string, string> = {
  '当前原稿超过 64 MB，请压缩配图或将内容拆分为多份简历后保存。':
    'The original exceeds 64 MB. Compress its images or split the content into separate resumes before saving.',
  '无法保存原稿，请重试。': 'Could not save the original. Please retry.',
  '文件超过 64 MB，请选择较小的 JSON 文件。': 'The file exceeds 64 MB. Choose a smaller JSON file.',
  '文件超过 64 MB。': 'The file exceeds 64 MB.',
  '备份文件超过 64 MB。': 'The backup file exceeds 64 MB.',
  ...Object.fromEntries(
    `已完成 {done} / {total} 项|Completed {done} / {total} checks
填写姓名、经历标题和成果，可使用 Markdown 格式。|Enter your name, experience headings and achievements using Markdown.
认识幸运|Meet Luck
简历编辑|Resume editor
我的简历|My resumes
模板中心|Templates
保存与帮助|Saving & help
幸运简历|Luck Resume
幸运简历首页|Luck Resume home
主导航|Main navigation
只在你的设备上|On your device
使用帮助|Help
项目文档|Project documentation
项目文档（新标签页）|Project documentation (opens in a new tab)
打开导航|Open navigation
正在打开你的工作台…|Opening your workspace…
重新读取|Reload
下载恢复文件|Download recovery file
下一站，|Next stop,
好运。|good luck.
把经历写成自己的样子，把可能留给下一次出发。|Tell your story your way, and make room for what comes next.
一张好纸，|A fresh page,
装得下你的闪光点。|with room for your strengths.
简历名称|Resume name
未命名简历|Untitled resume
草稿已保存到此设备|Draft saved on this device
本地保存失败|Local save failed
检测到版本冲突|Version conflict detected
正在保存…|Saving…
撤销|Undo
重做|Redo
新建简历|New resume
新建|New
导入 JSON|Import JSON
导入|Import
保存 JSON|Save JSON
存原稿|Save original
保存到关联文件|Save to linked file
有未保存修改|Unsaved changes
已保存|Saved
保存到文件|Save to file
文件已保存|File saved
更多导入导出|More import and export options
更多格式|More formats
导出 PDF|Export PDF
查看本地文件|View local file
此简历在另一个标签页有更新。当前修改仍在这里，请另存为副本。|This resume was updated in another tab. Your changes are still here; save a separate copy.
草稿未能写入浏览器。当前内容仍可编辑，请下载 JSON 保留修改。|The browser could not save the draft. You can keep editing; download JSON to keep your changes.
另存为副本|Save a copy
重试保存|Retry save
编辑内容|Edit content
预览简历|Preview resume
写内容|Content
调风格|Appearance
检查一下|Review
填写和排版，都在本地完成|Writing and layout stay on your device
存原稿会下载 JSON，换设备后导入即可继续。|Save original downloads JSON. Import it on another device to continue.
关于保存|About saving
写下你的第一份简历|Write your first resume
从空白开始，或导入保存好的 JSON 原稿。|Start with a blank page or import a saved JSON original.
导入 Markdown / 文本|Import Markdown / text
为下一站，新建一份简历|A new resume for your next step
例如：产品设计师求职简历|e.g. Product designer resume
选择一张好纸|Choose a template
使用示例内容，边看边修改|Start with sample content to explore and edit
示例为虚构内容，用于展示排版。新简历保存在此浏览器。|Samples are fictional and show the layout. Your new resume is saved in this browser.
取消|Cancel
创建简历|Create resume
删除这份本地草稿？|Delete this local draft?
如需保留可编辑版本，请先下载 JSON 备份。|Download a JSON backup first to keep an editable version.
保留草稿|Keep draft
正在删除…|Deleting…
删除草稿|Delete draft
删除这个简历模块？|Delete this resume section?
模块及其中内容将从这份简历中移除，可以通过撤销恢复。|The section and its contents will be removed from this resume. Undo can restore them.
保留模块|Keep section
删除模块|Delete section
恢复本地草稿|Recover local drafts
可恢复简历|Recoverable resumes
查看未恢复记录|View unrecovered records
关闭|Close
下载未恢复记录|Download unrecovered records
导入可恢复简历|Import recoverable resumes
需要再检查一下|Something needs attention
知道了|Got it
紧凑|Compact
适中|Balanced
舒展|Spacious
正文字号|Body font size
文字行高|Line height
页面边距|Page margins
模块间距|Section spacing
把风格，也留给自己|Make the style your own
先选喜欢的，再慢慢微调。|Choose what you like, then fine-tune it.
从一张好纸开始|Start with a good template
选一份马卡龙色|Choose a pastel color
薄荷绿|Mint
雾蓝|Mist blue
浅樱粉|Cherry blossom
薰衣草紫|Lavender
奶杏色|Apricot
海盐青|Seafoam
也可以自己调色|Or choose your own color
自定义模板颜色|Custom template color
背景和装饰随颜色变化，正文始终保持深色。|The color changes backgrounds and accents. Body text stays dark.
一键调整疏密|Adjust density
字体的气质|Choose a typeface
简洁黑体|Clean sans serif
雅致宋体|Elegant serif
名字放在哪里|Name alignment
靠左，自然大方|Left, natural and open
居中，正式一点|Center, a little more formal
靠右|Right
抬头布局|Header layout
并排|Side by side
上下排列|Stacked
显示字段图标|Show field icons
章节标题的样子|Section heading style
简约|Minimal
色块|Color block
细线|Fine line
更多细节，交给你|Fine-tune the details
条目标题布局|Entry heading layout
标题与日期分列|Title and date in separate columns
标题与日期上下排列|Title and date stacked
标题与日期同行|Title and date inline
副标题对齐|Subtitle alignment
靠左|Left
居中|Center
日期显示格式|Date display format
保持输入格式|Keep original format
文档语言|Document language
中文|Chinese
English（Present 日期）|English (Present dates)
姓名字号|Name font size
章节标题字号|Section heading font size
条目间距|Entry spacing
段落间距|Paragraph spacing
照片横向取景|Photo horizontal position
照片纵向取景|Photo vertical position
双栏左栏占比（%）|Left column width (%)
双栏间距（px）|Column gap (px)
双栏设置用于左右分栏模块和模块内双列；窄栏中的双列会自动收紧栏距，保留文字空间。|These settings apply to split sections and two-column entries. Narrow columns use a smaller gap to leave room for text.
照片的形状|Photo shape
方形|Square
圆角|Rounded
圆形|Circle
照片大小|Photo size
照片宽度|Photo width
照片高度|Photo height
照片圆角|Photo corner radius
宽度和高度可分别调整；使用照片大小可恢复预设尺寸，选择形状可恢复预设圆角。|Adjust width and height separately. Photo size restores preset dimensions; shape restores preset corners.
照片适配|Photo fit
填满并裁切|Fill and crop
完整显示|Contain
照片位置|Photo position
左侧|Left
右侧|Right
在简历中显示照片|Show photo on resume
恢复默认排版|Reset layout
跳转到简历模块|Jump to resume section
基本信息|Profile
未命名模块|Untitled section
从这里认识你|A first introduction
已隐藏|Hidden
隐藏|Hide
显示|Show
单列|One column
双列|Two columns
添加你需要的模块|Add a section
兴趣爱好|Interests
个人宣言|Personal statement
其他经历|Other experience
自定义字段 ·|Custom fields ·
字段名称和内容都由你决定，也可以只显示内容。|Choose each field's name and content, or display only its content.
字段|Field
例如：GitHub / 服务时长|e.g. GitHub / Volunteer hours
字段类型|Field type
文本|Text
链接|Link
多行文本|Multiline text
字段内容|Field content
填写你想展示的内容|Enter the content you want to show
显示此字段|Show this field
显示字段名称|Show field name
添加自定义字段|Add custom field
让彼此从这里认识|Let's start here
上传头像|Upload profile photo
当前头像|Current profile photo
正在处理图片…|Processing image…
一张得体的照片|A photo that feels like you
可选，支持 JPG、PNG、WebP|Optional; JPG, PNG and WebP supported
上传照片|Upload photo
移除|Remove
姓名|Name
你的姓名|Your name
所在城市|City
例如：杭州|e.g. Hangzhou
求职意向|Target role
例如：产品设计师 / 用户体验设计|e.g. Product designer / UX designer
联系电话|Phone
手机号码|Phone number
电子邮箱|Email
个人网站 / 作品集|Website / portfolio
请填写以 https:// 或 http:// 开头的完整地址。|Enter a complete address starting with https:// or http://.
不必面面俱到，|Start with what matters,
先让最重要的信息被看见。|and let your strengths stand out.
学校名称|School name
专业 / 学历|Major / degree
公司名称|Company name
职位名称|Job title
项目名称|Project name
担任角色|Role
论文标题|Publication title
研究方向|Research area
证书名称|Certificate name
资格类别|Qualification type
奖项名称|Award name
获奖类别|Award category
语言|Language
使用场景|Usage context
活动名称|Activity name
标题|Title
副标题|Subtitle
介绍一下自己|Introduce yourself
展示你的专长|Show your strengths
显示条目|Show entry
隐藏条目|Hide entry
复制条目|Duplicate entry
上移条目|Move entry up
下移条目|Move entry down
删除条目|Delete entry
删除这条内容？可通过撤销恢复。|Delete this entry? Undo can restore it.
删除|Delete
取消删除|Cancel deletion
条目标题、日期与地点（可选）|Entry title, dates and location (optional)
日期输入方式|Date input mode
自由输入|Free text
选择年月|Select month and year
自由输入的原日期仍保留，选择年月后才会替换。|Your original date text is kept until you select a month and year.
开始时间|Start date
结束时间|End date
至今|Present
目前仍在这里|I am currently here
相关链接（可选）|Related link (optional)
链接显示文字（可选）|Link text (optional)
例如：项目主页 / 阅读论文|e.g. Project homepage / Read publication
地点（可选）|Location (optional)
例如：杭州 / 远程|e.g. Hangzhou / Remote
内容|Content
经历描述|Experience description
正在准备编辑器…|Preparing editor…
写下你的积累与闪光点|Write about your experience and strengths
此模块已在简历中隐藏|This section is hidden on the resume
模块名称|Section name
显示模块标题|Show section heading
从新的一页开始|Start on a new page
模块在页面中的位置|Section placement
跟随模板|Follow template
占满整行|Full width
左半栏|Left column
右半栏|Right column
添加|Add
教育经历|Education
工作经历|Work experience
项目|Project
项目经历|Projects
技能内容|Skill
一条内容|Entry
日期|Date
地点|Location
描述|Description
图片|Image
字段名称、显示与配图|Field names, visibility and image
条目配图|Entry image
添加 / 更换配图|Add / replace image
移除配图|Remove image
配图对齐|Image alignment
配图宽度|Image width
把简历，安心留给自己|Keep your resume in your own hands
关于保存、备份和导出，你需要知道的几件小事。|A few things to know about saving, backups and exports.
少一点点击，多一点专注|Fewer clicks, more focus
保存关联文件 / 下载 JSON|Save linked file / download JSON
撤销修改|Undo changes
重做修改|Redo changes
无图标|No icon
邮箱|Email
电话|Phone
位置|Location
网站|Website
个人|Person
奖项|Award
出版物|Publication
工作|Work
教育|Education
代码|Code
消息|Message
一点认真，一点好运|A little care, a little luck
让每一段经历，|Give every experience
都有|its own
恰好的位置。|place to shine.
把走过的路，写成下一站的开始。|Let the path you've taken begin your next chapter.
一张清楚、好看的简历，从这里慢慢成形。|A clear, beautiful resume takes shape here.
开始写我的简历|Start my resume
继续编辑|Continue editing
无需注册|No account needed
本地保存|Saved locally
自由排版|Flexible layout
每一步，|Every step
都算数。|counts.
好消息。|good news.
使用方式|How it works
选一张合适的纸|Choose the right template
九种原创模板，让经历与表达各得其所。|Nine original templates give your experience room to speak.
写成自己的样子|Make it your own
内容、配色与间距，一边调整，一边看见。|See your content, colors and spacing as you adjust them.
带着认真出发|Take your next step
导出 A4 PDF，也留下随时可编辑的原稿。|Export an A4 PDF and keep an editable original.
九种表达，同样认真|Nine styles, the same care
你的故事，值得一张好纸。|Your story deserves a beautiful page.
去模板中心|Explore templates
关于你的事，留在你的设备里。|Your story stays on your device.
不设账号，不上传简历。编辑、排版与导出都在本地完成。|No account or resume uploads. Editing, layout and export happen locally.
下载一份 JSON 原稿，把下一次修改也握在自己手里。|Download a JSON original and keep the next edit in your hands.
只属于你|Yours alone
开始之前的小问题|Before you start
你也许想知道|You may be wondering
安心写下自己，|Focus on your story.
其他的，从这里了解。|Find the other details here.
幸运简历 · Luck Resume|Luck Resume
把可能，留给下一次出发。|Make room for what comes next.
回到工作台|Back to workspace
每一个版本，都为下一次出发准备。|Every version prepares you for your next step.
份本地草稿|local drafts
搜索简历|Search resumes
搜索简历名称|Search by resume name
没有找到这份简历|No resumes found
你的下一站，从这里开始|Your next step begins here
试试其他名称，或清空搜索。|Try another name or clear the search.
新建一份简历，或者导入你保存的 JSON 文件。|Create a resume or import a saved JSON file.
清空搜索|Clear search
创建第一份简历|Create your first resume
草稿保存在此浏览器。换设备前，请下载 JSON 文件备份。|Drafts are saved in this browser. Download a JSON backup before switching devices.
本地 JSON 文件|Local JSON file
打开 JSON 后关联本地文件，编辑完成后点击保存。文件关联仅在本次页面会话中保留。|Open a JSON file to link it, then save after editing. The link lasts for this page session.
已关联：|Linked:
正在处理…|Processing…
有未保存到文件的修改|Changes have not been saved to the file
已保存到文件|Saved to file
尚未关联本地文件|No local file linked
打开并关联 JSON|Open and link JSON
另存为 JSON 文件|Save as JSON file
断开文件关联|Unlink file
当前浏览器未提供完整的本地文件访问功能。可使用页面中的“导入”和“存原稿”完成 JSON 导入与下载。|This browser does not provide full local file access. Use Import and Save original to import and download JSON.
公司 / 学校标识|Company / school logo
当前条目标识|Current entry logo
上传标识|Upload logo
移除标识|Remove logo
显示标识|Show logo
标识尺寸|Logo size
标识圆角|Logo corner radius
标识位置|Logo position
标识适配|Logo fit
填满裁切|Fill and crop
本地标识素材库|Local logo library
素材名称|Asset name
例如：公司名称|e.g. Company name
保存当前标识|Save current logo
搜索本地标识|Search local logos
使用|Use
还没有保存的标识素材。|No logos saved yet.
没有匹配的标识。|No matching logos.
正在计算…|Calculating…
一页适配建议|One-page fit suggestions
当前排版已经可以放进一页，无需调整。|The current layout already fits on one page.
当前使用了手动分页。保留分页，或关闭模块的「从新的一页开始」后再计算。|Manual page breaks are active. Keep them, or turn off Start on a new page for each section and recalculate.
在建议字号与间距范围内无法放进一页。可以保留多页，或精简、隐藏部分内容后再试。|The content cannot fit on one page within the suggested font and spacing range. Keep multiple pages, or shorten or hide some content and try again.
找到一组可以放进一页的设置。内容、字段和模板都会保留，应用后可以撤销。|These settings fit the resume on one page. Content, fields and template are preserved, and you can undo the change.
默认|Default
应用建议|Apply suggestions
实时预览|Live preview
页|pages
跳转到页|Jump to page
每一次认真介绍自己，都是一次新的可能。|Every thoughtful introduction opens a new possibility.
缩小预览|Zoom out
放大预览|Zoom in
适应宽度|Fit width
贡献日历 · 本地导入|Contribution calendar · local import
将活动次数整理成 JSON 或 CSV，预览后添加到简历。日期数据只在本地读取。|Prepare activity counts as JSON or CSV, preview them, and add them to your resume. Dates are read locally.
日历标题|Calendar title
在简历中显示贡献日历|Show contribution calendar on resume
当前日历：|Current calendar:
年，|year,
天数据。|days of data.
移除日历|Remove calendar
导入年份|Import year
导入标题|Import title
贡献日历|Contribution calendar
查看 JSON / CSV 示例|View JSON / CSV examples
CSV 第一行使用 date,count；JSON 使用 days 数组。日期须属于导入年份且不重复，次数为 0–1000000 的整数。|Use date,count as the CSV header or a days array in JSON. Dates must be unique and belong to the selected year; counts must be integers from 0 to 1000000.
粘贴贡献数据|Paste contribution data
预览数据|Preview data
选择 JSON / CSV 文件|Choose JSON / CSV file
正在读取文件…|Reading file…
贡献日历导入预览|Contribution calendar import preview
天数据，共|days of data, totaling
次；|activities;
显示在简历中|Show on resume
导入后隐藏|Hide after import
应用此日历|Apply calendar
信息显示、名称与顺序|Field visibility, names and order
联系方式的显示顺序，包括你添加的字段。|Contact information display order, including custom fields.
未命名字段|Untitled field
不显示状态|No status
已发表|Published
已接收|Accepted
预印本|Preprint
已投稿|Submitted
论文作者与引用格式|Authors and citation format
显示论文信息|Show publication information
作者列表|Authors
用分号或换行分隔作者，如 Doe, Jane; 张三|Separate authors with semicolons or new lines, e.g. Doe, Jane; Smith, Alex
每位作者用分号或换行分隔，姓名内的逗号会保留。|Separate authors with semicolons or new lines. Commas within names are preserved.
加粗作者|Author to emphasize
选择或输入需要加粗的完整姓名|Select or enter the full name to display in bold
期刊 / 会议|Journal / conference
发表状态|Publication status
引用格式|Citation style
普通列表|Plain list
编号引用|Numbered citations
作者与年份|Author and year
论文格式预览|Publication format preview
格式预览|Format preview
下载分卷恢复文件|Download recovery volumes
· 原始大记录，需单独修复|· Large original record; repair separately
再次下载|Download again
下载|Download
出发前，再看一眼|One more look before you go
根据投递版本中的可见内容，帮你检查细节。|Check the details in the visible content of your submission version.
已完成|Completed
项|items
回到内容，完善一下|Return to content to refine it
投递之前，下载 JSON 原稿，再预览一次 PDF。|Before applying, download the JSON original and preview your PDF once more.
这里的检查基于已填写内容，所有处理都在本地完成。|Checks use your entered content and run entirely on your device.
加粗|Bold
斜体|Italic
下划线|Underline
删除线|Strikethrough
无序列表|Bullet list
有序列表|Numbered list
文字格式|Text formatting
增加列表缩进|Indent list
减少列表缩进|Outdent list
编辑文字链接|Edit text link
段落对齐|Paragraph alignment
左对齐|Align left
右对齐|Align right
两端对齐|Justify
字号|Font size
选区字号|Selection font size
缩进|Indent
段落缩进|Paragraph indent
行距|Line spacing
段落行距|Paragraph line spacing
高亮|Highlight
文字高亮|Text highlight
无|None
浅粉|Pale pink
丁香紫|Lilac
奶油黄|Cream
清除格式|Clear formatting
文字链接地址|Text link address
请填写完整的安全链接。|Enter a complete, safe link.
应用|Apply
关闭链接编辑|Close link editor
为你的故事，选一张好纸|Choose a page for your story
九种原创排版，给不同的经历留出合适的位置。所有模板都支持自定义内容。|Nine original layouts give different experiences the right place. Every template supports custom content.
当前使用|In use
应用到当前简历|Apply to current resume
使用模板|Use template
颜色可以柔和，表达始终清晰。|Soft colors, clear expression.
每个模板都支持更换配色、调整字体与间距。|Every template supports custom colors, fonts and spacing.
界面主题|Interface theme
跟随系统|System
浅色界面|Light
深色界面|Dark
导入与导出|Import and export
导出当前简历|Export current resume
Markdown 可导出可见文字正文。附带完整原稿后，重新导入还能保留字段、隐藏内容、图片和排版。|Markdown exports visible text. Include the full original to preserve fields, hidden content, images and layout when importing it again.
附带完整原稿（含隐藏内容，适合备份）|Include full original (with hidden content, suitable for backup)
导出 Markdown|Export Markdown
导出独立 HTML|Export standalone HTML
导入本地文字|Import local text
导入 Markdown 或文本|Import Markdown or text
选择本地文件或粘贴文字，在预览后创建新简历。|Choose a local file or paste text, then preview it before creating a resume.
选择 Markdown 或文本文件|Choose Markdown or text file
新简历标题|New resume title
留空时使用正文标题|Leave blank to use the content heading
Markdown 或文本内容|Markdown or text content
预览导入|Preview import
导入预览|Import preview
选择导入内容|Choose import source
修改后的 Markdown 正文|Edited Markdown content
文件内保存的完整原稿|Full original embedded in file
（已隐藏）|(hidden)
确认导入为新简历|Import as new resume
工作区布局|Workspace layout
工作区|Workspace
展开编辑区|Expand editor
收起编辑区|Collapse editor
展开编辑|Expand editor
收起编辑|Collapse editor
展开预览区|Expand preview
收起预览区|Collapse preview
展开预览|Expand preview
收起预览|Collapse preview
恢复布局|Reset layout
调整编辑区宽度|Resize editor
界面语言|Interface language
{count} 条内容|{count} entries
拖动{name}模块|Drag {name} section
上移{name}|Move {name} up
下移{name}|Move {name} down
隐藏{name}|Hide {name}
显示{name}|Show {name}
删除{name}模块|Delete {name} section
{name}布局|{name} layout
上移自定义字段 {count}|Move custom field {count} up
下移自定义字段 {count}|Move custom field {count} down
复制自定义字段 {count}|Duplicate custom field {count}
删除自定义字段 {count}|Delete custom field {count}
字段名称 {count}|Field name {count}
字段类型 {count}|Field type {count}
字段图标 {count}|Field icon {count}
字段内容 {count}|Field content {count}
经历 {count}|Experience {count}
拖动条目 {count}|Drag entry {count}
填写{name}|Enter {name}
{name}描述 {count}|{name} description {count}
{name}字段名称|{name} field name
从{name}模板新建简历|Create resume from {name} template
打开{name}|Open {name}
复制{name}|Duplicate {name}
下载{name}的 JSON|Download JSON for {name}
删除{name}|Delete {name}
{date}：{count} 次|{date}: {count} activities
{name}显示名称|{name} display name
{name}图标|{name} icon
上移联系信息 {count}|Move contact field {count} up
下移联系信息 {count}|Move contact field {count} down
使用{name}模板|Use {name} template
编辑区 {count}%|Editor {count}%
第 {count} 页|Page {count}
第 {count} 份：{reason}|Record {count}: {reason}
有 {count} 份草稿需要恢复，其他简历已正常打开。原始数据仍保留在此设备，可先下载恢复文件。|{count} drafts need recovery. Other resumes opened normally. The original data remains on this device; download a recovery file first.
找到 {count} 份可恢复简历，{failed} 份记录仍需修复。恢复后会创建独立副本。|Found {count} recoverable resumes; {failed} records still need repair. Recovery creates separate copies.
「{name}」将从此浏览器删除。你已下载的 JSON 和 PDF 文件不受影响。|“{name}” will be deleted from this browser. Downloaded JSON and PDF files are unaffected.
数据已分为 {count} 个文件，请逐个下载。可导入的分卷可通过「导入 JSON」分别恢复。|Data is split into {count} files. Download each file, then use Import JSON to recover each importable volume.
操作未能完成，请重试。|The operation could not be completed. Please try again.
文件超过 64 MB，请选择较小的 JSON 备份或分卷恢复文件。|The file exceeds 64 MB. Choose a smaller JSON backup or recovery volume.
无法读取此文件，请重试。|Unable to read this file. Please try again.
简历内容已更新，请重新导出 PDF。|The resume has changed. Export the PDF again.
当前排版无法完成分页，请回到编辑区调整排版。|Pagination could not complete. Adjust the layout in the editor.
未能打开打印窗口，请重试或使用浏览器的打印菜单。|Unable to open the print dialog. Retry or use the browser's Print menu.
无法删除本地草稿，可能在另一个标签页有更新。请重新打开后再试。|Unable to delete the local draft. It may have changed in another tab. Reopen it and retry.
图片无法读取，请重试。|Unable to read the image. Please try again.
图片无法读取。|Unable to read the image.
标识素材操作失败，请重试。|Unable to complete the logo operation. Please try again.
无法使用此素材。|Unable to use this asset.
简历内容已更新，请重新计算。|The resume has changed. Calculate again.
请先打开一份简历。|Open a resume first.
暂时无法计算，请重试。|Unable to calculate. Please try again.
无法读取日期数据。|Unable to read date data.
文件大小不能超过 2 MB。|The file must be no larger than 2 MB.
无法读取文件，请重新选择。|Unable to read the file. Choose it again.
恢复文件无法下载，原始数据仍保留在当前设备或导入文件中。|Unable to download the recovery file. The original data remains on this device or in the imported file.
Markdown 导出失败。|Markdown export failed.
HTML 导出失败。|HTML export failed.
请选择 .md、.markdown 或 .txt 文件。|Choose an .md, .markdown or .txt file.
文件超过 64 MB，请选择较小的文件。|The file exceeds 64 MB. Choose a smaller file.
无法读取文件。|Unable to read the file.
无法解析文字。|Unable to parse the text.
文楷|WenKai
小薇|XiaoWei
照片比例|Photo aspect ratio
本地写作检查|Local writing check
按本地规则检查重复用词、标点、笼统表述和长句。建议供你逐项判断。|Local rules check repeated words, punctuation, vague wording and long sentences. Review each suggestion yourself.
发现 {count} 处可检查的表述|Found {count} wording suggestions
未发现规则覆盖的写作问题。|No issues found by the writing rules.
重复用词|Repeated words
连续标点|Repeated punctuation
表述可更具体|Be more specific
长句|Long sentence
检查相邻重复词，保留一次即可。|Check the repeated words and keep one occurrence if appropriate.
检查连续标点，按句意保留合适的一个。|Check the repeated punctuation and choose the appropriate mark for the sentence.
可用已发生的行动、使用的方法或真实成果，具体说明这处表述。|Make this specific with an action you took, a method you used or a result you achieved.
这句话较长，可按行动与结果拆分，让每句话表达一个重点。|Consider splitting this long sentence into actions and results, with one main point per sentence.
目录自动备份|Automatic folder backup
选择本机目录后，全部简历的修改会自动保存为 JSON。重命名使用同一文件，删除简历会保留已有备份。|Choose a local folder to automatically save every resume as JSON. Renaming keeps the same file; deleting a resume keeps its existing backup.
当前浏览器不支持目录访问。可使用 JSON 下载保存原稿。|This browser does not support folder access. Download JSON to save an editable original.
备份目录：|Backup folder:
正在处理…|Processing…
等待重新授权|Waiting for permission
已完成自动备份|Automatic backup complete
目录已连接|Folder connected
尚未选择备份目录|No backup folder selected
更换备份目录|Change backup folder
选择备份目录|Choose backup folder
重新连接|Reconnect
重新扫描备份|Rescan backups
断开目录|Disconnect folder
无法读取的文件（{count}）|Unreadable files ({count})
查看和恢复备份|View and restore backups
先选择备份检查内容。恢复会创建独立的新简历。|Select a backup to inspect its contents. Restoring creates a separate new resume.
备份文件（{count}）|Backup files ({count})
选择要查看的备份|Select a backup to inspect
备份更新时间：{date}|Backup updated: {date}
与本地简历内容相同|Matches the local resume
此备份比同 ID 的本地简历更新|This backup is newer than the local resume with the same ID
本地已有同 ID 的不同版本|A different local version has the same ID
查看完整备份内容|View full backup contents
恢复为新简历|Restore as new resume
已恢复为新简历。|Restored as a new resume.
长图与长页 PDF|Long image and single-page PDF
按当前模板导出连续内容，保留字体与图片。长页 PDF 为单页图片式 PDF，文字不可选择。|Export continuous content with the current template, fonts and images. The single-page PDF contains an image; its text cannot be selected.
导出长图 PNG|Export long PNG
导出长页 PDF|Export single-page PDF
取消导出|Cancel export
导出进度|Export progress
正在取消，当前图片处理结束后停止…|Cancelling after the current image finishes…
正在准备字体和图片…|Preparing fonts and images…
正在生成文件…|Creating files…
正在渲染长图…|Rendering long image…
内容较长，已按原清晰度分段。请按编号下载全部图片，顺序拼接后即为完整简历。|The content was split to preserve its resolution. Download all numbered images in order to assemble the complete resume.
导出完成。若下载未自动开始，可点击下面的文件。|Export complete. If the download did not start, select a file below.
长图导出失败，请重试。|Long image export failed. Please try again.
无法测量简历尺寸，请重新打开简历后重试。|Unable to measure the resume. Reopen it and retry.
导出倍率须在 1 至 4 之间。|Export scale must be between 1 and 4.
内容超过单页 PDF 的长度上限，请使用 A4 打印或独立 HTML 导出。|The content exceeds the single-page PDF length limit. Use A4 printing or standalone HTML export.
内容超过长图导出的内存上限，请使用 A4 打印或独立 HTML 导出。|The content exceeds the memory limit for long images. Use A4 printing or standalone HTML export.
字体文件未能读取，请重试。|Unable to read the font file. Please try again.
简历中有无法读取的图片，请重新选择图片后重试。|A resume image cannot be read. Select the image again and retry.
导出图片须来自本地文件或当前站点，请重新选择图片。|Export images must come from local files or this site. Select the image again.
简历图片未能读取，请重新选择图片后重试。|Unable to read a resume image. Select it again and retry.
简历图片未能解码，请重新选择图片后重试。|Unable to decode a resume image. Select it again and retry.
另一项长图导出正在处理，请等待完成。|Another long image export is running. Wait for it to finish.
请先打开需要导出的简历。|Open the resume to export first.
简历图片渲染失败，请重新选择图片后重试。|A resume image failed to render. Select it again and retry.
浏览器无法保持长图清晰度，请使用 A4 打印或独立 HTML 导出。|The browser cannot preserve the long image resolution. Use A4 printing or standalone HTML export.
写下可见姓名|Add a visible name
姓名会显示在投递版本中。|Your name appears in the exported resume.
姓名尚未填写或已隐藏。|The name is empty or hidden.
明确求职意向|State your target role
用一句可见的标题说明你想做什么。|Use a visible headline to describe the role you want.
求职意向尚未填写或已隐藏。|The target role is empty or hidden.
留下可见联系方式|Add visible contact information
支持电话、邮箱，以及自定义的微信等联系信息。|Use a phone number, email address or custom contact details such as WeChat.
至少保留一种可见的联系方式。|Keep at least one contact method visible.
展示你的经历|Show your experience
任意可见模块都可以展示经历、作品或能力。|Use any visible section to show experience, work or skills.
简历内容|Resume content
当前还没有可见的经历内容。|There is no visible experience content yet.
检查可见链接|Check visible links
检查基本信息、自定义字段和描述中的链接。|Check links in your profile, custom fields and descriptions.
链接需要完整的 http、https、mailto 或 tel 地址。|Use a complete http, https, mailto or tel URL.
检查日期顺序|Check date order
对可识别的年月进行比较，自由输入的文字保持原样。|Compare recognizable months and years; free-form date text stays as entered.
检查邮箱格式|Check email format
检查可见电子邮箱的基本格式。|Check the basic format of the visible email address.
检查邮箱中的 @、域名和空格。|Check the email address for an @ sign, domain and extra spaces.
收起空白模块|Hide empty sections
空模块不会打印，可隐藏它们，让编辑区更清楚。|Empty sections do not print. Hide them to simplify the editor.
此模块没有可见内容。|This section has no visible content.
结束时间早于开始时间，请检查日期。|The end date is earlier than the start date. Check the dates.
文件超过 32 MB。|The file exceeds 32 MB.
备份清单格式无效。|The backup manifest format is invalid.
备份清单条目无效。|A backup manifest entry is invalid.
目录中的 JSON 超过 1000 个，请选择较小的备份目录。|The folder contains more than 1,000 JSON files. Choose a smaller backup folder.
备份清单需要检查，自动写入已暂停。|The backup manifest needs review. Automatic writing is paused.
目录权限已失效，请点击重新连接。|Folder permission has expired. Select Reconnect.
备份清单已被外部修改，请重新连接后检查。|The backup manifest was changed externally. Reconnect and inspect it.
备份文件超过 32 MB。|The backup file exceeds 32 MB.
备份文件已被外部修改或不属于当前备份清单，已保留原文件。|The backup was changed externally or is absent from this manifest. The original file was preserved.
备份连接已更改。|The backup connection changed.
备份文件已被外部修改。|The backup file was changed externally.
文件已被外部修改。|The file was changed externally.
文件在备份期间被外部修改，已保留外部内容。|The file was changed externally during backup. The external contents were preserved.
备份目录已包含 1000 份文档，请选择其他备份目录。|The backup directory already contains 1000 documents. Choose another backup directory.
 · 原始大记录，需单独修复| · Large original record; repair separately
年份应为 1960–2100 的整数。|The year must be an integer between 1960 and 2100.
标题最多 300 个字符。|The title must be no longer than 300 characters.
显示状态应为 true 或 false。|Visibility must be true or false.
日期数据最多包含 366 天。|Date data can contain up to 366 days.
日期应使用 YYYY-MM-DD 格式。|Dates must use YYYY-MM-DD format.
所有日期必须真实有效，并属于所选年份。|All dates must be valid and belong to the selected year.
每日次数应为 0–1000000 的整数。|Daily counts must be integers between 0 and 1000000.
请提供 JSON 或 CSV 日期数据。|Provide date data in JSON or CSV format.
JSON 格式不正确。|The JSON format is invalid.
JSON 应包含 days 数组。|The JSON must contain a days array.
数据年份与所选年份不一致。|The data year does not match the selected year.
CSV 第一行应为 date,count。|The CSV header must be date,count.
CSV 每行应为 YYYY-MM-DD,非负整数。|Each CSV row must contain YYYY-MM-DD and a nonnegative integer, separated by a comma.
文件为空，请选择其他文件。|The file is empty. Choose another file.
请选择 PDF、PNG、JPEG 或 WebP 文件。|Choose a PDF, PNG, JPEG or WebP file.
图片没有 PDF 文字层，请选择 OCR。|Images have no PDF text layer. Select OCR.
文件内容不完整或格式不正确，请选择幸运简历导出的 JSON 文件。|The file is incomplete or invalid. Choose a JSON file exported by Luck Resume.
图片必须是文件中内嵌的 PNG、JPEG 或 WebP 图片。|Images must be embedded PNG, JPEG or WebP images.
文件包含不支持的图标。|The file contains an unsupported icon.
文件含有不支持的链接，请使用 http、https、mailto 或 tel 地址。|The file contains an unsupported link. Use an http, https, mailto or tel URL.
文本结构过于复杂，请简化内容后重试。|The text structure is too complex. Simplify it and retry.
文件中的条目标识重复或缺失。|An entry ID is missing or duplicated.
头像必须是文件中内嵌的 PNG、JPEG 或 WebP 图片。|The profile photo must be an embedded PNG, JPEG or WebP image.
自定义字段标识与内置字段重复。|A custom field ID duplicates a built-in field ID.
无法读取 JSON，请检查文件是否完整。|Unable to read the JSON. Check that the file is complete.
请选择幸运简历导出的 JSON 备份文件。|Choose a JSON backup exported by Luck Resume.
暂不支持此文件版本，请使用相应版本的幸运简历打开。|This file version is unsupported. Open it in the corresponding version of Luck Resume.
请选择幸运简历导出的恢复文件。|Choose a recovery file exported by Luck Resume.
暂不支持此恢复文件版本。|This recovery file version is unsupported.
请选择 JPG、PNG 或 WebP 图片。|Choose a JPG, PNG or WebP image.
请选择小于 8 MB 的图片。|Choose an image smaller than 8 MB.
无法处理这张图片，请尝试另一张。|Unable to process this image. Try another image.
处理后的图片较大，请选择尺寸更小的图片。|The processed image is too large. Choose a smaller image.
当前排版无法容纳文字，请增大模块宽度或减小字号。|The current layout cannot fit the text. Increase the section width or reduce the font size.
当前内容超出纸张范围，请调整排版。|The content exceeds the page bounds. Adjust the layout.
个人信息超出一页，请精简抬头内容或减小字号。|The profile exceeds one page. Shorten the header or reduce the font size.
Markdown 文件超过 64 MB。|The Markdown file exceeds 64 MB.
请粘贴或选择需要导入的文字。|Paste or select the text to import.
草稿索引需要恢复。|The draft index needs recovery.
文件超过 32 MB，请选择较小的 JSON 文件。|The file exceeds 32 MB. Choose a smaller JSON file.
当前简历导出的 JSON 超过 32 MB，请减少图片或文字内容后重试。|The exported JSON exceeds 32 MB. Reduce the images or text and retry.
此文件正在保存，请完成后再重试。|This file is being saved. Wait for it to finish and retry.
未获得文件写入权限，请允许访问或另存为新文件。|File write permission was not granted. Allow access or save as a new file.
文件已被外部修改。请重新打开该文件，或将当前草稿另存为新文件。|The file was changed externally. Reopen it or save the current draft as a new file.
标识素材格式无效。|The logo asset format is invalid.
标识素材日期无效。|The logo asset date is invalid.
无法访问备份目录。|Unable to access the backup folder.
文件超过 {size} MB，请选择较小的文件。|The file exceeds {size} MB. Choose a smaller file.
已取消文档读取。|Document reading cancelled.
请输入有效页码，例如 1-3, 5，且不超过总页数。|Enter valid page numbers, such as 1-3, 5, within the document page count.
正在读取本地文件…|Reading local file…
正在渲染第 {page} 页…|Rendering page {page}…
正在加载本地 OCR 引擎和语言数据…|Loading the local OCR engine and language data…
正在识别第 {page} 页…|Recognizing page {page}…
正在提取第 {page} 页的文字…|Extracting text from page {page}…
导入 PDF 或图片|Import PDF or image
文件在当前设备处理。先选择页码并提取文字，核对后预览，再创建新简历。|Files are processed on this device. Select pages, extract and review the text, then preview it before creating a new resume.
选择 PDF 或图片文件|Choose a PDF or image file
支持 PDF、PNG、JPEG、WebP，最大 64 MB。|Supports PDF, PNG, JPEG and WebP, up to 64 MB.
共 {count} 页|{count} pages
PDF 密码不正确，请重试。|The PDF password is incorrect. Please try again.
此 PDF 需要密码。|This PDF requires a password.
PDF 密码|PDF password
解锁 PDF|Unlock PDF
选择读取页码|Select pages to read
全部页面|All pages
指定页码|Specific pages
页码范围|Page range
读取方式|Reading method
自动选择|Automatic
仅 PDF 文字层|PDF text layer only
OCR 图片识别|OCR image recognition
OCR 语言|OCR language
简体中文与英文|Simplified Chinese and English
英文|English
简体中文|Simplified Chinese
自动选择优先读取 PDF 文字层；图片使用 OCR。扫描 PDF 可在提取后明确选择 OCR，或直接选择 OCR 模式。|Automatic mode reads the PDF text layer first and uses OCR for images. For scanned PDFs, select OCR after extraction or choose OCR mode directly.
提取所选页面|Extract selected pages
已完成 {done} / {total} 页|Completed {done} / {total} pages
取消读取|Cancel reading
核对提取文字|Review extracted text
逐页检查阅读顺序、换行和 OCR 错字。这里的文字可直接修改，修改后需要重新预览。|Check the reading order, line breaks and OCR mistakes on each page. Edit the text here, then preview again.
部分页面没有提取到文字。可使用 OCR、补充文字，或逐页确认该页无需文字；确认前不会导入。|Some pages have no extracted text. Use OCR, add text or confirm each page needs no text. Import remains unavailable until all pages are reviewed.
对无文字页面使用 OCR|Use OCR for pages without text
第 {page} 页|Page {page}
PDF 文字层|PDF text layer
置信度 {value}%|Confidence {value}%
此页 OCR 置信度较低，请仔细核对。|OCR confidence is low on this page. Review the text carefully.
确认此页无需导入文字|Confirm this page needs no text imported
OCR 识别进程未能启动。|OCR worker failed.
OCR 识别失败。|OCR failed.
图片尚未加载。|Image is not loaded.
浏览器画布不可用。|Canvas is unavailable.
无法渲染页面图片。|Unable to render page image.
文档提取已在进行中。|Document extraction is already running.
页码选择无效。|Invalid page selection.
页数无效。|Invalid page count.
页码范围无效。|Invalid page range.
图片尺寸无效。|Invalid image dimensions.
OCR 识别进程尚未初始化。|OCR worker is not initialized.
文件内的完整原稿无法读取，已保留可读正文供导入。|The embedded editable original could not be read. The readable text is available for import.
Markdown 正文已修改，预览将采用修改后的正文；也可以选择文件内保存的完整原稿。|The Markdown text has changed. The preview uses the edited text; you may also choose the complete editable original embedded in the file.
{days} 天数据，共 {count} 次；{visibility}|{days} days, {count} activities; {visibility}
草稿，留在你的浏览器|Drafts stay in your browser
编辑时会自动保存本地草稿。页面显示「草稿已保存到此设备」后，可在同一个浏览器中重新打开。清理网站数据或使用隐私浏览可能使草稿无法保留。|Drafts are saved locally as you edit. After “Draft saved on this device” appears, reopen the resume in the same browser. Clearing site data or using private browsing may remove drafts.
关联文件，直接保存回本地|Link a file and save directly
在「更多格式」中打开并关联 JSON，或将当前简历另存为 JSON 文件。关联后可以直接保存回文件，Ctrl / ⌘ + S 也会保存到该文件。若文件已被其他程序修改，会保留两边内容并提示重新打开或另存。文件关联在关闭或刷新页面后结束。|Use More formats to open and link JSON, or save the current resume as a JSON file. Save directly to the linked file with Ctrl / ⌘ + S. If another program changes it, both versions are kept and you can reopen or save separately. Closing or refreshing ends the link.
JSON，是可以继续编辑的原稿|JSON keeps your editable original
点击「存原稿」下载 JSON 完整备份，包含文字、模板、排版、字段、隐藏内容和图片。换电脑时，通过「导入」打开 JSON 就能继续编辑。导入总会创建一份新简历。|Save original downloads a complete JSON backup with text, template, layout, fields, hidden content and images. Import it on another computer to continue editing. Importing always creates a new resume.
恢复文件，逐份检查后找回|Review and recover individual drafts
下载的恢复文件也可以通过「导入 JSON」打开。系统会逐份检查，能恢复的简历会另存为副本；暂时无法恢复的记录可以继续下载保留。|Open downloaded recovery files with Import JSON. Each record is checked separately. Recoverable resumes are saved as copies, while other records remain available to download and keep.
更多格式，方便迁移与离线使用|More formats for transfer and offline use
通过「更多格式」导入 Markdown 或文本，预览后创建新简历。Markdown 默认导出可见文字，勾选附带完整原稿后也能保存隐藏内容和排版。独立 HTML 内含字体与图片，可以离线打开和打印。|Import Markdown or text from More formats, preview it and create a new resume. Markdown exports visible text by default. Include the full original to preserve hidden content and layout. Standalone HTML embeds fonts and images for offline viewing and printing.
PDF，是准备投递的成品|PDF is ready to send
预览中可查看页数并跳转页面。点击「导出 PDF」，在打印窗口选择「另存为 PDF」、A4 纸张、100% 缩放，关闭页眉和页脚。开启背景图形可以保留模板底色。PDF 不包含可恢复的编辑数据。|Check the page count and navigate pages in the preview. Select Export PDF, then Save as PDF, A4 paper and 100% scale in the print dialog. Disable headers and footers; enable background graphics to keep template colors. PDF does not contain editable recovery data.
重要版本，记得下载一份|Download important versions
完成一份简历后，建议同时保存 JSON 与 PDF。幸运简历不提供云端简历存储，文字、头像和导入文件都在你的设备中处理。|Save both JSON and PDF when a version is ready. Luck Resume has no cloud resume storage. Text, photos and imported files are processed on your device.
我的简历会上传到服务器吗？|Is my resume uploaded to a server?
简历内容、照片和排版都在你的浏览器中处理，不会上传到服务器。无需注册账号，也不需要提供个人信息来开始使用。|Your resume content, photos and layout are processed in your browser and are not uploaded. Start without registering or providing personal information.
下次打开还能继续编辑吗？|Can I continue editing next time?
草稿会自动保存在当前浏览器中。你也可以下载 JSON 原稿作为备份，之后导入即可继续编辑。清理浏览器数据前，请先保存原稿。|Drafts are saved automatically in this browser. Download a JSON original as a backup and import it later to continue. Save the original before clearing browser data.
怎样得到可以投递的简历？|How do I get a resume ready to send?
在编辑器中点击“导出 PDF”，进入浏览器的打印窗口后选择“另存为 PDF”。预览使用 A4 分页，导出时保留你的内容与排版。|Select Export PDF in the editor, then Save as PDF in the browser print dialog. The preview uses A4 pages, preserving your content and layout when exported.
模板里的内容可以自由调整吗？|Can I customize the template content?
可以。九种模板都使用同一份可编辑简历内容，你可以随时切换模板、调整颜色和字体，也可以增加模块、自定义字段与经历。|Yes. All nine templates share your editable resume content. Switch templates, change colors and fonts, and add sections, custom fields and entries at any time.
可以换一台设备继续吗？|Can I continue on another device?
可以。把 JSON 原稿保存到你自己的设备或存储空间，在另一台设备打开幸运简历并导入。原稿保留可编辑内容和排版设置。|Yes. Save the JSON original to your device or storage, then open Luck Resume and import it on another device. The original keeps your editable content and layout settings.
添加{name}|Add {name}
字段 {count}|Field {count}`
      .split('\n')
      .map((line) => {
        const separator = line.indexOf('|');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  ),
  ...workspaceFeaturesEnglish,
  ...workspaceToolsEnglish,
  ...appearancePresets,
  ...versionHistoryEnglish,
  ...layoutQualityEnglish,
  ...workspaceBackupEnglish,
  ...aiEnglish,
  ...mediaEnglish,
  ...editorOptionsEnglish,
  ...flexibleFieldEnglish,
  ...advancedTextEnglish,
  ...iconDiscoveryEnglish,
  ...editorFreedomEnglish,
  ...entryTransferEnglish,
  保留原文字体与段落样式: 'Keep original text and paragraph appearance',
  表格编辑: 'Table editor',
  插入表格: 'Insert table',
  上方插入行: 'Insert row above',
  下方插入行: 'Insert row below',
  删除行: 'Delete row',
  左侧插入列: 'Insert column left',
  右侧插入列: 'Insert column right',
  删除列: 'Delete column',
  合并单元格: 'Merge cells',
  拆分单元格: 'Split cell',
  切换表头行: 'Toggle header row',
  切换表头列: 'Toggle header column',
  删除表格: 'Delete table',
  单元格底色: 'Cell background',
  '导出 Word': 'Export Word',
  '正在导出 Word…': 'Exporting Word…',
  '按模块顺序导出可编辑 Word，保留文字格式、链接、表格和图片':
    'Export an editable Word document in section order, preserving text formatting, links, tables and images',
  '按模块顺序以单栏导出可编辑 Word，保留文字格式、链接、表格和图片':
    'Export an editable single-column Word document in section order, preserving text formatting, links, tables and images',
  '无法导出 Word，请检查图片内容后重试。': 'Could not export Word. Check the images and try again.',
};
