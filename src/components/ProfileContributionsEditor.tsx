import { useI18n, t, errorText } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import type { Profile } from '../resume/model.ts';
import { contributionFileLimit, parseContributions } from '../resume/contributions.ts';
import { fetchGithubCalendar } from '../resume/media.ts';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { Button, Field } from './ui';

export default function ProfileContributionsEditor({ profile }: { profile: Profile }) {
  useI18n();
  const update = useWorkspace((state) => state.update);
  const documentId = useWorkspace((state) => state.activeId);
  const [year, setYear] = useState(String(profile.contributions?.year ?? new Date().getFullYear()));
  const [title, setTitle] = useState(profile.contributions?.title ?? '');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<NonNullable<Profile['contributions']> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const remoteRequest = useRef<AbortController | null>(null);
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    request.current += 1;
    setSource('');
    setPreview(null);
    setError('');
    setLoading(false);
    setUsername('');
    setGithubToken('');
    setYear(String(profile.contributions?.year ?? new Date().getFullYear()));
    setTitle(profile.contributions?.title ?? '');
    return () => {
      request.current += 1;
      remoteRequest.current?.abort();
    };
    // Draft import state belongs to the selected document.
  }, [documentId]);

  const invalidate = () => {
    request.current += 1;
    remoteRequest.current?.abort();
    setPreview(null);
    setError('');
    setLoading(false);
  };
  const parse = (text: string) => {
    try {
      const calendar = parseContributions(text, Number(year), title || undefined);
      setPreview(calendar);
      setError('');
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : '无法读取日期数据。');
    }
  };
  const readFile = async (file: File) => {
    invalidate();
    if (file.size > contributionFileLimit) {
      setError('文件大小不能超过 2 MB。');
      return;
    }
    const token = request.current;
    const targetId = documentId;
    setLoading(true);
    try {
      const text = await file.text();
      if (request.current !== token || useWorkspace.getState().activeId !== targetId) return;
      setSource(text);
      parse(text);
    } catch {
      if (request.current === token) setError('无法读取文件，请重新选择。');
    } finally {
      if (request.current === token) setLoading(false);
    }
  };

  const retrieve = async () => {
    invalidate();
    const generation = request.current;
    const targetId = documentId;
    const controller = new AbortController();
    remoteRequest.current = controller;
    setLoading(true);
    try {
      const calendar = await fetchGithubCalendar(username, githubToken, Number(year), {
        signal: controller.signal,
      });
      if (request.current !== generation || useWorkspace.getState().activeId !== targetId) return;
      if (title.trim()) calendar.title = title;
      setPreview(calendar);
    } catch (reason) {
      if (request.current === generation) setError(errorText(reason));
    } finally {
      if (request.current === generation) setLoading(false);
    }
  };

  return (
    <details className="profile-options contributions-editor">
      <summary>{t('贡献日历 · GitHub / 本地导入')}</summary>
      <p className="field-hint">
        {t('将活动次数整理成 JSON 或 CSV，预览后添加到简历。日期数据只在本地读取。')}
      </p>
      {profile.contributions && (
        <>
          <Field
            label={t('日历标题')}
            value={profile.contributions.title}
            maxLength={300}
            onChange={(event) => {
              const value = event.target.value;
              setTitle(value);
              invalidate();
              update(
                (doc) => {
                  if (doc.profile.contributions) doc.profile.contributions.title = value;
                },
                'contributions-title',
                documentId ?? undefined,
              );
            }}
          />
          <label className="check-field">
            <input
              type="checkbox"
              checked={profile.contributions.visible}
              onChange={(event) => {
                update(
                  (doc) => {
                    if (doc.profile.contributions)
                      doc.profile.contributions.visible = event.target.checked;
                  },
                  undefined,
                  documentId ?? undefined,
                );
              }}
            />
            {t('在简历中显示贡献日历')}
          </label>
          <p className="field-hint">
            {t('当前日历：')}
            {profile.contributions.year}
            {t('年，')}
            {profile.contributions.days.length}
            {t('天数据。')}
          </p>
          <Button
            variant="danger"
            onClick={() => {
              invalidate();
              update(
                (doc) => {
                  delete doc.profile.contributions;
                },
                undefined,
                documentId ?? undefined,
              );
            }}
          >
            <Trash2 size={14} />
            {t('移除日历')}
          </Button>
        </>
      )}
      <div className="form-grid">
        <Field
          label={t('导入年份')}
          type="number"
          min={1960}
          max={2100}
          step={1}
          value={year}
          onChange={(event) => {
            setYear(event.target.value);
            invalidate();
          }}
        />
        <Field
          label={t('导入标题')}
          maxLength={300}
          placeholder={t('贡献日历')}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            invalidate();
          }}
        />
      </div>
      <div className="github-acquisition">
        <div className="form-grid">
          <Field
            label={t('GitHub 用户名')}
            value={username}
            maxLength={39}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setUsername(event.target.value);
              invalidate();
            }}
          />
          <Field
            label={t('GitHub Token')}
            type="password"
            value={githubToken}
            maxLength={512}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setGithubToken(event.target.value);
              invalidate();
            }}
          />
        </div>
        <p className="field-hint">
          {t('Token 仅用于本次页面会话的 GitHub 请求；应用后只保存日历快照。')}
        </p>
        <Button
          disabled={loading || !username.trim() || !githubToken.trim()}
          onClick={() => void retrieve()}
        >
          {t('获取 GitHub 日历')}
        </Button>
      </div>
      <details className="contributions-help">
        <summary>{t('查看 JSON / CSV 示例')}</summary>
        <p className="field-hint">
          {t(
            'CSV 第一行使用 date,count；JSON 使用 days 数组。日期须属于导入年份且不重复，次数为 0–1000000 的整数。',
          )}
        </p>
        <pre>{`date,count\n${year}-01-01,3\n${year}-01-02,0`}</pre>
        <pre>
          {JSON.stringify(
            {
              year: Number(year),
              title: t('贡献日历'),
              visible: true,
              days: [{ date: `${year}-01-01`, count: 3 }],
            },
            null,
            2,
          )}
        </pre>
      </details>
      <label className="field">
        <span>{t('粘贴贡献数据')}</span>
        <textarea
          aria-label={t('粘贴贡献数据')}
          rows={5}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            invalidate();
          }}
          placeholder="date,count"
        />
      </label>
      <input
        ref={input}
        type="file"
        hidden
        accept=".json,.csv,application/json,text/csv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void readFile(file);
        }}
      />
      <div className="field-checks">
        <Button disabled={loading || !source.trim()} onClick={() => parse(source)}>
          {t('预览数据')}
        </Button>
        <Button disabled={loading} onClick={() => input.current?.click()}>
          <Upload size={14} />
          {t('选择 JSON / CSV 文件')}
        </Button>
      </div>
      {loading && (
        <p role="status" className="field-hint">
          {t('正在读取文件…')}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {errorText(error)}
        </p>
      )}
      {preview && (
        <div className="contributions-preview" aria-label={t('贡献日历导入预览')}>
          <strong>
            {preview.title || t('贡献日历')} · {preview.year}
          </strong>
          <p className="field-hint">
            {t('{days} 天数据，共 {count} 次；{visibility}', {
              days: preview.days.length,
              count: preview.days.reduce((sum, day) => sum + day.count, 0),
              visibility: preview.visible ? t('显示在简历中') : t('导入后隐藏'),
            })}
          </p>
          <div className="contributions-preview-days" role="list">
            {preview.days.map((day) => (
              <span
                key={day.date}
                role="listitem"
                title={t('{date}：{count} 次', { date: day.date, count: day.count })}
                aria-label={t('{date}：{count} 次', { date: day.date, count: day.count })}
                data-active={day.count > 0}
              />
            ))}
          </div>
          <Button
            variant="primary"
            onClick={() => {
              update(
                (doc) => {
                  doc.profile.contributions = structuredClone(preview);
                },
                undefined,
                documentId ?? undefined,
              );
              setTitle(preview.title);
              setPreview(null);
              setSource('');
            }}
          >
            {t('应用此日历')}
          </Button>
        </div>
      )}
    </details>
  );
}
