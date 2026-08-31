import { useI18n, t } from '../i18n';
import { Download, FileJson, HardDrive, Printer } from 'lucide-react';

export default function Help() {
  useI18n();
  const items = [
    {
      icon: HardDrive,
      title: '草稿，留在你的浏览器',
      content:
        '编辑时会自动保存本地草稿。页面显示「草稿已保存到此设备」后，可在同一个浏览器中重新打开。清理网站数据或使用隐私浏览可能使草稿无法保留。',
    },
    {
      icon: FileJson,
      title: '关联文件，直接保存回本地',
      content:
        '在「更多格式」中打开并关联 JSON，或将当前简历另存为 JSON 文件。关联后可以直接保存回文件，Ctrl / ⌘ + S 也会保存到该文件。若文件已被其他程序修改，会保留两边内容并提示重新打开或另存。文件关联在关闭或刷新页面后结束。',
    },
    {
      icon: FileJson,
      title: 'JSON，是可以继续编辑的原稿',
      content:
        '点击「存原稿」下载 JSON 完整备份，包含文字、模板、排版、字段、隐藏内容和图片。换电脑时，通过「导入」打开 JSON 就能继续编辑。导入总会创建一份新简历。',
    },
    {
      icon: FileJson,
      title: '恢复文件，逐份检查后找回',
      content:
        '下载的恢复文件也可以通过「导入 JSON」打开。系统会逐份检查，能恢复的简历会另存为副本；暂时无法恢复的记录可以继续下载保留。',
    },
    {
      icon: FileJson,
      title: '更多格式，方便迁移与离线使用',
      content:
        '通过「更多格式」导入 Markdown 或文本，预览后创建新简历。Markdown 默认导出可见文字，勾选附带完整原稿后也能保存隐藏内容和排版。独立 HTML 内含字体与图片，可以离线打开和打印。',
    },
    {
      icon: Printer,
      title: 'PDF，是准备投递的成品',
      content:
        '预览中可查看页数并跳转页面。点击「导出 PDF」，在打印窗口选择「另存为 PDF」、A4 纸张、100% 缩放，关闭页眉和页脚。开启背景图形可以保留模板底色。PDF 不包含可恢复的编辑数据。',
    },
    {
      icon: Download,
      title: '重要版本，记得下载一份',
      content:
        '完成后可同时保存 JSON 与 PDF。本站不保存云端简历。编辑、本地 OCR 和原生打印在设备完成；AI 润色、AI 导入和直接下载分页 PDF 仅在你主动操作时发送必要内容处理。',
    },
  ];
  return (
    <section className="full-page help-page">
      <div className="page-heading">
        <div>
          <h1>{t('把简历，安心留给自己')}</h1>
          <p>{t('关于保存、备份和导出，你需要知道的几件小事。')}</p>
        </div>
      </div>
      <div className="help-list">
        {items.map(({ icon: Icon, title, content }) => (
          <article key={title}>
            <Icon size={23} />
            <div>
              <h2>{t(title)}</h2>
              <p>{t(content)}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="keyboard-guide">
        <h2>{t('少一点点击，多一点专注')}</h2>
        <dl>
          <div>
            <dt>{t('保存关联文件 / 下载 JSON')}</dt>
            <dd>
              <kbd>Ctrl / ⌘</kbd>
              <kbd>S</kbd>
            </dd>
          </div>
          <div>
            <dt>{t('撤销修改')}</dt>
            <dd>
              <kbd>Ctrl / ⌘</kbd>
              <kbd>Z</kbd>
            </dd>
          </div>
          <div>
            <dt>{t('重做修改')}</dt>
            <dd>
              <kbd>Ctrl / ⌘</kbd>
              <kbd>Shift</kbd>
              <kbd>Z</kbd>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
