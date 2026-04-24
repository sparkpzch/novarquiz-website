"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { motion } from "motion/react";
import { useToast } from "@/components/ui/Toast";
import { auth } from "@/lib/firebase/config";

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#192246] shadow-[0_10px_24px_rgba(17,87,145,0.12)]"
    >
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <label className="block text-lg font-medium text-[#67758D]">{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-[16px] border border-[#DCE6F3] bg-white px-5 py-4 pr-12 text-lg font-medium text-[#192246] outline-none placeholder:text-[#B3BFCE] focus:border-[#70A2F9]"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A7B3C3]"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            {visible ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3l18 18M10.478 10.477a3 3 0 1 0 4.244 4.244M9.88 5.09A10.94 10.94 0 0 1 12 4.875c4.478 0 8.268 2.943 9.542 7a10.47 10.47 0 0 1-2.04 3.368M6.228 6.228A10.451 10.451 0 0 0 2.458 12c1.274 4.057 5.064 7 9.542 7a10.94 10.94 0 0 0 5.771-1.647"
              />
            ) : (
              <>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7Z"
                />
              </>
            )}
          </svg>
        </button>
      </div>
      {hint && <p className="text-sm font-medium text-[#7F8BA0]">{hint}</p>}
    </div>
  );
}

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPw !== confirmPw) {
      showToast("Both passwords must match.", "error");
      return;
    }
    if (newPw.length < 8) {
      showToast("New password must be at least 8 characters.", "error");
      return;
    }
    if (!user?.email) return;

    setLoading(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(auth.currentUser!, cred);
      await updatePassword(auth.currentUser!, newPw);
      showToast("Password updated!", "success");
      router.push("/profile");
    } catch {
      showToast("Failed to update password", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <BackButton onClick={() => router.push("/profile")} />

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="nq-card rounded-[34px] px-6 py-8"
      >
        <h1 className="text-[2.2rem] font-bold leading-tight text-[#111827]">
          Change new password
        </h1>
        <p className="mt-4 max-w-md text-[1.05rem] font-medium leading-8 text-[#6A7485]">
          Your new password must be different from previous used password.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <PasswordField
            label="Password"
            value={currentPw}
            onChange={setCurrentPw}
          />
          <PasswordField
            label="New Password"
            value={newPw}
            onChange={setNewPw}
            hint="Must be at least 8 characters."
          />
          <PasswordField
            label="Confirm New Password"
            value={confirmPw}
            onChange={setConfirmPw}
            hint="Both passwords must match."
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-[16px] bg-[#3C5FBA] px-5 py-4 text-xl font-semibold text-white shadow-[0_14px_30px_rgba(17,87,145,0.16)] disabled:opacity-60"
          >
            {loading ? t("profile.update_password") + "..." : "Change Password"}
          </button>
        </form>
      </motion.section>
    </div>
  );
}
