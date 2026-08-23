import type { ContributionCalendar as Calendar } from './model.ts';
import { calendarWeeks } from './calendar.ts';

export default function ContributionCalendar({
  calendar,
  language = 'zh',
}: {
  calendar?: Calendar;
  language?: 'zh' | 'en';
}) {
  if (!calendar?.visible) return null;
  const weeks = calendarWeeks(calendar);
  const total = calendar.days.reduce((sum, day) => sum + day.count, 0);
  const title = calendar.title || (language === 'en' ? 'Contributions' : '贡献记录');
  const summary = `${title} · ${calendar.year} · ${total} ${language === 'en' ? 'contributions' : '次贡献'}`;
  return (
    <figure className="resume-contributions" aria-label={summary}>
      <figcaption>{summary}</figcaption>
      <div
        className="contribution-weeks"
        role="img"
        aria-label={summary}
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((week, index) => (
          <div className="contribution-week" key={index}>
            {week.map((day, dayIndex) => (
              <span
                key={day?.date ?? dayIndex}
                className={`contribution-cell contribution-level-${day ? (day.count === 0 ? 0 : day.count <= 3 ? 1 : day.count <= 7 ? 2 : day.count <= 12 ? 3 : 4) : 'empty'}`}
                title={day ? `${day.date}: ${day.count}` : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </figure>
  );
}
