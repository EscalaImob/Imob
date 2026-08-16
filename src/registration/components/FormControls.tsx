import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ChevronDownIcon } from "./icons";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function TextField({ label, id, ...props }: TextFieldProps) {
  return (
    <label className="registration-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...props} />
    </label>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: readonly string[];
  placeholder: string;
}

export function SelectField({ label, id, options, placeholder, ...props }: SelectFieldProps) {
  return (
    <label className="registration-field registration-select" htmlFor={id}>
      <span>{label}</span>
      <span className="registration-select__control">
        <select id={id} {...props}>
          <option value="" disabled>{placeholder}</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <ChevronDownIcon />
      </span>
    </label>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function TextAreaField({ label, id, ...props }: TextAreaFieldProps) {
  return (
    <label className="registration-field" htmlFor={id}>
      <span>{label}</span>
      <textarea id={id} {...props} />
    </label>
  );
}
