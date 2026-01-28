import { Switch } from "@/lib/components/ui/switch";

interface PluginSwitchProps {
  id?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (...args: unknown[]) => void | Promise<void>;
}

export function PluginSwitch({
  id,
  checked,
  defaultChecked,
  disabled,
  className,
  onChange,
}: PluginSwitchProps) {
  const handleCheckedChange = (value: boolean) => {
    onChange?.(value);
  };

  return (
    <Switch
      id={id}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      className={className}
      onCheckedChange={handleCheckedChange}
    />
  );
}
