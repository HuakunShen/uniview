import { useState } from "react";
import { Button, Input, Switch, Toggle } from "@uniview/example-plugin-api";

interface FormData {
  username: string;
  email: string;
  notifications: boolean;
  marketing: boolean;
  preference: string;
}

export default function AdvancedDemo() {
  const [formData, setFormData] = useState<FormData>({
    username: "",
    email: "",
    notifications: false,
    marketing: false,
    preference: "email",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleInputChange = (
    field: keyof FormData,
    value: string | boolean,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSubmitting(false);
    setSubmitted(true);
  };

  const handleReset = () => {
    setFormData({
      username: "",
      email: "",
      notifications: false,
      marketing: false,
      preference: "email",
    });
    setSubmitted(false);
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Advanced Demo
        </h2>
        <p className="text-sm text-zinc-400">
          Form, Switch, and Toggle components
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">
            User Profile Form
          </h3>

          <div className="space-y-2">
            <Input
              label="Username"
              placeholder="Enter your username"
              value={formData.username}
              onChange={(value: string) => handleInputChange("username", value)}
            />
            <p className="text-xs text-zinc-500">
              This is your public display name
            </p>
          </div>

          <div className="space-y-2">
            <Input
              label="Email Address"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(value: string) => handleInputChange("email", value)}
            />
            <p className="text-xs text-zinc-500">
              We'll never share your email
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">
            Notification Preferences
          </h3>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-zinc-300">
                Email Notifications
              </label>
              <p className="text-xs text-zinc-500">
                Receive email notifications about your account
              </p>
            </div>
            <Switch
              checked={formData.notifications}
              onChange={(checked: boolean) =>
                handleInputChange("notifications", checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-zinc-300">
                Marketing Emails
              </label>
              <p className="text-xs text-zinc-500">
                Receive marketing and promotional emails
              </p>
            </div>
            <Switch
              checked={formData.marketing}
              onChange={(checked: boolean) =>
                handleInputChange("marketing", checked)
              }
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">
            Communication Method
          </h3>

          <div className="flex gap-2">
            <Toggle
              pressed={formData.preference === "email"}
              onClick={() => handleInputChange("preference", "email")}
              className="flex-1"
            >
              Email
            </Toggle>
            <Toggle
              pressed={formData.preference === "sms"}
              onClick={() => handleInputChange("preference", "sms")}
              className="flex-1"
            >
              SMS
            </Toggle>
            <Toggle
              pressed={formData.preference === "push"}
              onClick={() => handleInputChange("preference", "push")}
              className="flex-1"
            >
              Push
            </Toggle>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button
            title={isSubmitting ? "Submitting..." : "Submit Form"}
            variant="primary"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !formData.username.trim() ||
              !formData.email.trim()
            }
            className="flex-1"
          />
          <Button
            title="Reset"
            variant="secondary"
            onClick={handleReset}
            className="flex-1"
          />
        </div>
      </div>

      {submitted && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-white text-xs">✓</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-emerald-300">
                Form Submitted Successfully!
              </h4>
              <p className="text-xs text-emerald-400/80">
                <strong>Username:</strong> {formData.username}
                <br />
                <strong>Email:</strong> {formData.email}
                <br />
                <strong>Notifications:</strong>{" "}
                {formData.notifications ? "Enabled" : "Disabled"}
                <br />
                <strong>Marketing:</strong>{" "}
                {formData.marketing ? "Enabled" : "Disabled"}
                <br />
                <strong>Preference:</strong> {formData.preference}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
