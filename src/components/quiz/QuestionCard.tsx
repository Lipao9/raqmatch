"use client";

import { useTranslations } from "next-intl";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  optionLabelKey,
  SCALE_MAX,
  SCALE_MIN,
  type AnswerValue,
  type Question,
} from "@/lib/questions";

interface QuestionCardProps {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}

const optionCardClass = (selected: boolean, disabled = false) =>
  `flex items-center gap-3 rounded-xl border p-4 transition-all duration-150 ${
    disabled
      ? "cursor-not-allowed opacity-50 border-input bg-card/60"
      : "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/60"
  } ${
    selected
      ? "border-primary bg-accent"
      : "border-input bg-card/60"
  }`;

function MultiOptions({ question, value, onChange }: QuestionCardProps) {
  const t = useTranslations("quiz");
  const selected = Array.isArray(value) ? value : [];
  const max = question.maxSelections ?? question.options.length;

  function toggle(option: string) {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option));
      return;
    }
    // The exclusive option ("nothing") unticks the others, and picking any
    // other option unticks it.
    if (option === question.exclusiveOption) {
      onChange([option]);
      return;
    }
    const next = selected.filter((v) => v !== question.exclusiveOption);
    if (next.length >= max) return;
    onChange([...next, option]);
  }

  return (
    <div className="flex flex-col gap-3" role="group">
      {question.maxSelections && (
        <p className="text-sm text-muted-foreground">
          {t("multiHint", { max: question.maxSelections })}
        </p>
      )}
      {question.options.map((option) => {
        const isSelected = selected.includes(option);
        const atMax =
          !isSelected &&
          option !== question.exclusiveOption &&
          selected.filter((v) => v !== question.exclusiveOption).length >= max;
        return (
          <label key={option} className={optionCardClass(isSelected, atMax)}>
            <input
              type="checkbox"
              className="peer sr-only"
              checked={isSelected}
              disabled={atMax}
              onChange={() => toggle(option)}
            />
            <span
              aria-hidden
              className={`flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 ${
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input"
              }`}
            >
              {isSelected && (
                <svg viewBox="0 0 12 12" className="size-3" fill="none">
                  <path
                    d="M2.5 6.5l2.5 2.5 4.5-5.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span className="text-base">
              {t(optionLabelKey(question.id, option))}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ScaleOptions({ question, value, onChange }: QuestionCardProps) {
  const t = useTranslations("quiz");
  const points = Array.from(
    { length: SCALE_MAX - SCALE_MIN + 1 },
    (_, i) => SCALE_MIN + i,
  );

  // Deliberately tappable segments, not a drag slider: sliders measurably hurt
  // response rates on mobile (see specs/quiz-v2-brasil.md §0). No preselected
  // value — an untouched scale must not read as a weak vote for the middle.
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" role="group">
        {points.map((point) => (
          <button
            key={point}
            type="button"
            aria-pressed={value === point}
            onClick={() => onChange(point)}
            className={`h-12 flex-1 rounded-xl border text-base font-medium transition-all duration-150 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
              value === point
                ? "border-primary bg-accent"
                : "cursor-pointer border-input bg-card/60 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/60"
            }`}
          >
            {point}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{t(`questions.${question.id}.anchors.low`)}</span>
        <span className="text-right">
          {t(`questions.${question.id}.anchors.high`)}
        </span>
      </div>
    </div>
  );
}

export function QuestionCard({ question, value, onChange }: QuestionCardProps) {
  const t = useTranslations("quiz");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-3xl font-semibold tracking-tight">
          {t(`questions.${question.id}.title`)}
          {question.optional && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {t("optional")}
            </span>
          )}
        </h2>
        {t.has(`questions.${question.id}.description`) && (
          <p className="text-muted-foreground">
            {t(`questions.${question.id}.description`)}
          </p>
        )}
      </div>

      {question.kind === "text" ? (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(`questions.${question.id}.placeholder`)}
          maxLength={120}
          className="h-11 rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : question.kind === "longtext" ? (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(`questions.${question.id}.placeholder`)}
          maxLength={500}
          rows={5}
          className="resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : question.kind === "multi" ? (
        <MultiOptions question={question} value={value} onChange={onChange} />
      ) : question.kind === "scale" ? (
        <ScaleOptions question={question} value={value} onChange={onChange} />
      ) : (
        <RadioGroup
          key={question.id}
          value={typeof value === "string" ? value : null}
          onValueChange={(v) => onChange(String(v))}
          className="gap-3"
        >
          {question.options.map((option) => (
            <label key={option} className={optionCardClass(value === option)}>
              <RadioGroupItem value={option} />
              <span className="text-base">
                {t(optionLabelKey(question.id, option))}
              </span>
            </label>
          ))}
        </RadioGroup>
      )}
    </div>
  );
}
