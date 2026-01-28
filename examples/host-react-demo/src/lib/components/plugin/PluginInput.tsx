import type { ChangeEvent } from "react";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";

interface PluginInputProps {
  id?: string;
  label?: string;
  placeholder?: string;
  type?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  className?: string;
  onInput?: (...args: unknown[]) => void | Promise<void>;
  onChange?: (...args: unknown[]) => void | Promise<void>;
}

export function PluginInput({
  id,
  label,
  placeholder,
  type = "text",
  value,
  defaultValue,
  disabled,
  className,
  onInput,
  onChange,
}: PluginInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onInput?.(newValue);
    onChange?.(newValue);
  };

  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <Input
        id={inputId}
        type={type}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        className={className}
        onChange={handleChange}
      />
    </div>
  );
}
