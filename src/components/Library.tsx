import { useI18n, t } from '../i18n';
import { useState } from 'react';
import { ArrowUpRight, Copy, Download, FilePlus2, Search, Trash2 } from 'lucide-react';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { downloadResume } from '../resume/files.ts';
import { templates } from '../resume/model.ts';
import { Button, IconButton } from './ui';
import { Thumbnail } from './PreviewPanel';

export default function Library({
  onOpen,
  onCreate,
  confirmDelete,
}: {
  onOpen: () => void;
  onCreate: () => void;
  confirmDelete: (id: string) => void;
}) {
  const { locale } = useI18n();
  const documents = useWorkspace((s) => s.documents);
  const select = useWorkspace((s) => s.select);
  const duplicate = useWorkspace((s) => s.duplicate);
  const [query, setQuery] = useState('');
  const all = Object.values(documents).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const filtered = all.filter((d) =>
    `${d.title} ${d.profile.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="full-page">
      <div className="page-heading">
        <div>
          <h1>{t('我的简历')}</h1>
          <p>{t('每一个版本，都为下一次出发准备。')}</p>
        </div>
        <Button variant="primary" onClick={onCreate}>
          <FilePlus2 size={17} />
          {t('新建简历')}
        </Button>
      </div>
      <div className="library-toolbar">
        <span>
          {all.length}
          {t('份本地草稿')}
        </span>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={t('搜索简历')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('搜索简历名称')}
          />
        </label>
      </div>
      {filtered.length ? (
        <div className="resume-grid">
          {filtered.map((document) => (
            <article className="library-item" key={document.id}>
              <button
                type="button"
                className="library-preview"
                aria-label={t('打开{name}', { name: document.title })}
                onClick={() => {
                  select(document.id);
                  onOpen();
                }}
              >
                <Thumbnail document={document} />
                <span className="open-document">
                  {t('继续编辑')}
                  <ArrowUpRight size={16} />
                </span>
              </button>
              <div className="library-meta">
                <button
                  type="button"
                  className="document-name"
                  onClick={() => {
                    select(document.id);
                    onOpen();
                  }}
                >
                  {document.title}
                </button>
                <p>
                  {t(
                    templates.find((template) => template.id === document.appearance.template)
                      ?.name ?? '',
                  )}
                  <span>
                    {new Date(document.updatedAt).toLocaleDateString(
                      locale === 'en' ? 'en-US' : 'zh-CN',
                    )}
                  </span>
                </p>
                <div className="library-actions">
                  <IconButton
                    label={t('复制{name}', { name: document.title })}
                    onClick={() => {
                      duplicate(document.id);
                      onOpen();
                    }}
                  >
                    <Copy size={16} />
                  </IconButton>
                  <IconButton
                    label={t('下载{name}的 JSON', { name: document.title })}
                    onClick={() => downloadResume(document)}
                  >
                    <Download size={16} />
                  </IconButton>
                  <IconButton
                    label={t('删除{name}', { name: document.title })}
                    onClick={() => confirmDelete(document.id)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Search size={32} />
          <h2>{query ? t('没有找到这份简历') : t('你的下一站，从这里开始')}</h2>
          <p>
            {query
              ? t('试试其他名称，或清空搜索。')
              : t('新建一份简历，或者导入你保存的 JSON 文件。')}
          </p>
          {query ? (
            <Button onClick={() => setQuery('')}>{t('清空搜索')}</Button>
          ) : (
            <Button variant="primary" onClick={onCreate}>
              {t('创建第一份简历')}
            </Button>
          )}
        </div>
      )}
      <p className="library-footnote">
        {t('草稿保存在此浏览器。换设备前，请下载 JSON 文件备份。')}
      </p>
    </section>
  );
}
