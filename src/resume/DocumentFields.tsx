import { fieldDisplayValue, fieldLink } from './fields.ts';
import type { ResumeField } from './model.ts';
import FieldIcon from './FieldIcon';

export default function DocumentFields({
  fields,
  className,
  icons = true,
  emailUnderline,
}: {
  fields: ResumeField[];
  className: string;
  icons?: boolean;
  emailUnderline?: boolean;
}) {
  return (
    <div className={className}>
      {fields
        .filter((field) => field.visible && fieldDisplayValue(field).trim())
        .map((field) => {
          const href = fieldLink(field);
          const content = (
            <>
              {icons && <FieldIcon name={field.icon} />}
              {field.showLabel && field.label && <strong>{field.label}： </strong>}
              {fieldDisplayValue(field)}
            </>
          );
          return (
            <span
              key={field.id}
              data-field-id={field.id}
              className={`resume-field resume-field-${field.kind}`}
            >
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  style={
                    field.id === 'email' && emailUnderline !== undefined
                      ? { textDecoration: emailUnderline ? 'underline' : 'none' }
                      : undefined
                  }
                >
                  {content}
                </a>
              ) : (
                content
              )}
            </span>
          );
        })}
    </div>
  );
}
