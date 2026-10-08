"use client";
import SurveyGate from '@/components/onboarding/SurveyGate';

import { useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "@/lib/hooks/useTheme";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { updateProfile, signOut } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/config";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import TermsModal from "@/components/ui/TermsModal";
import { useToast } from "@/components/ui/Toast";
import { motion } from "motion/react";
import Link from "next/link";
import ProfileAvatar from "@/components/ui/ProfileAvatar";

function ChevronRight() {
  return (
    <svg
      className="h-5 w-5 text-[#192246]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}


function QuestionnaireIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#6EA2FF]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M9 3h6v4H9V3Zm-1 9h8m-8 4h5"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#6EA2FF]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V8.25a4.5 4.5 0 1 0-9 0v2.25m-.75 0h10.5A1.5 1.5 0 0 1 18.75 12v6A1.5 1.5 0 0 1 17.25 19.5H6.75A1.5 1.5 0 0 1 5.25 18v-6a1.5 1.5 0 0 1 1.5-1.5Z"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#6EA2FF]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 1-5.714 0M18 8.25a6 6 0 1 0-12 0c0 7.372-3 8.25-3 8.25h18s-3-.878-3-8.25ZM13.73 21a2.25 2.25 0 0 1-3.46 0"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#6EA2FF]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.598.748-3.752A9.75 9.75 0 1 0 21.752 15.002Z"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#6EA2FF]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3c2.755 2.11 5.992 3.25 9 3.25 0 5.27-1.764 10.71-9 14.5-7.236-3.79-9-9.23-9-14.5C6.008 6.25 9.245 5.11 12 3Z"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#E85C5C]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
      />
    </svg>
  );
}

function DeleteAccountIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#D9485F]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 7.5h12m-9.75 0V6a1.5 1.5 0 0 1 1.5-1.5h4.5a1.5 1.5 0 0 1 1.5 1.5v1.5m-8.25 0v10.125A2.625 2.625 0 0 0 10.125 20.25h3.75A2.625 2.625 0 0 0 16.5 17.625V7.5m-6 3.75v5.25m3-5.25v5.25"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a2.25 2.25 0 1 1 3.182 3.182l-10.5 10.5a4.5 4.5 0 0 1-1.897 1.13l-3.187.91.91-3.187a4.5 4.5 0 0 1 1.13-1.897l10.675-10.675ZM19.5 7.125 16.875 4.5"
      />
    </svg>
  );
}

function Toggle({
  enabled,
  disabled = false,
  onToggle,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
        enabled ? "bg-[#3A66C1]" : "bg-[#D9E1EE]"
      } ${disabled ? "opacity-60" : ""}`}
      aria-pressed={enabled}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function GeneralRow({
  icon,
  label,
  description,
  trailing,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <div className="flex items-center gap-4 py-1">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3F8FF] shadow-sm">
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[1.05rem] font-bold text-[#16324F] font-display tracking-tight">{label}</p>
          {description && (
            <p className="nq-content mt-0.5 text-[#8FA3BD] font-medium">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">{trailing}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition hover:opacity-85">
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left transition hover:opacity-85"
      >
        {content}
      </button>
    );
  }

  return content;
}

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const copy = (en: string, th: string) => i18n.language.startsWith("th") ? th : en;
  const { user, refreshUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editModal, setEditModal] = useState(false);
  const [termsModal, setTermsModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `Users/Profile Pictures/${user.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(auth.currentUser!, { photoURL: url });
      await refreshUser();
      showToast(copy("Profile photo updated", "บันทึกรูปโปรไฟล์แล้ว"), "success");
    } catch {
      showToast(copy("Upload failed", "อัปโหลดรูปไม่ได้ ลองอีกครั้ง"), "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const trimmed = newName.trim();
      if (trimmed && trimmed !== user.displayName) {
        await updateProfile(auth.currentUser!, { displayName: trimmed });
        await refreshUser();
      }
      showToast(copy("Profile updated", "บันทึกโปรไฟล์แล้ว"), "success");
      setEditModal(false);
    } catch {
      showToast(copy("Failed to update profile", "บันทึกโปรไฟล์ไม่ได้ ลองอีกครั้ง"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      showToast(t('auth.logout_error'), 'error');
    }
  };

  const handleDeleteAccount = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setDeletingAccount(true);
    try {
      const idToken = await currentUser.getIdToken(true);
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Delete account failed");
      }

      setDeleteModal(false);
      await signOut(auth).catch(() => {});
      showToast(copy("Account deleted", "ลบบัญชีแล้ว"), "success");
      window.location.href = "/sign-in";
    } catch {
      showToast(copy("Failed to delete account", "ลบบัญชีไม่ได้ ลองอีกครั้ง"), "error");
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px]">
      <h1 className="sr-only">{t("nav.profile")}</h1>
      <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="nq-welcome-card nq-always-dark relative overflow-hidden rounded-xl p-5 text-white sm:p-6"
      >
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label={copy("Change profile photo", "เปลี่ยนรูปโปรไฟล์")}
              title={copy("Change profile photo", "เปลี่ยนรูปโปรไฟล์")}
              className="group relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait"
            >
              <ProfileAvatar
                displayName={user?.displayName}
                photoURL={user?.photoURL}
                size={72}
                ringClassName="ring-2 ring-white/35"
              />
              <span className={`absolute inset-0 items-center justify-center rounded-full bg-black/45 ${uploading ? "flex" : "hidden"}`}>
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </span>
              <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-black/70 text-white transition group-hover:bg-black">
                <CameraIcon />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="nq-on-dark truncate text-2xl font-bold leading-tight">
                {user?.displayName || copy("Player", "ผู้เล่น")}
              </p>
              <p className="nq-on-dark-muted truncate text-sm">
                {user?.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setNewName(user?.displayName || ""); setEditModal(true); }}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-base font-semibold text-[#075b95] transition hover:opacity-90 sm:w-auto sm:px-5 sm:py-2.5 sm:text-sm"
          >
            <EditIcon />
            <span>{t("profile.edit_profile")}</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoUpload}
        />
      </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="nq-card rounded-xl p-6"
      >
        <h2 className="mb-5 text-2xl font-semibold text-[#202A3F]">{t("profile.general")}</h2>
        <div className="space-y-5">
          <GeneralRow
            icon={<LockIcon />}
            label={t("profile.change_password")}
            href="/profile/change-password"
            trailing={<ChevronRight />}
          />
          <SurveyGate editing renderTrigger={(open, label) => (
            <GeneralRow
              icon={<QuestionnaireIcon />}
              label={label}
              onClick={open}
              trailing={<ChevronRight />}
            />
          )} />

          <GeneralRow
            icon={<BellIcon />}
            label={t("profile.language")}
            href="/profile/language"
            trailing={
              <>
                <span className="text-sm text-[#6D7D95]">
                  {i18n.language === "en" ? t("language.english") : t("language.thai")}
                </span>
                <ChevronRight />
              </>
            }
          />

          <GeneralRow
            icon={<MoonIcon />}
            label={t("profile.dark_mode")}
            trailing={<Toggle enabled={theme === "dark"} onToggle={toggleTheme} />}
          />

          <GeneralRow
            icon={<ShieldIcon />}
            label={t("profile.terms_privacy")}
            onClick={() => setTermsModal(true)}
            trailing={<ChevronRight />}
          />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="nq-card rounded-xl p-6"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-4 py-1 transition hover:opacity-85"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 shadow-sm">
              <LogoutIcon />
            </div>
            <span className="text-[1.05rem] font-medium text-[#E85C5C]">{t("nav.logout")}</span>
          </button>

          <button
            type="button"
            onClick={() => setDeleteModal(true)}
            className="flex w-full items-center gap-4 py-1 transition hover:opacity-85"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 shadow-sm">
              <DeleteAccountIcon />
            </div>
            <span className="text-[1.05rem] font-medium text-[#D9485F]">
              {t("profile.delete_account")}
            </span>
          </button>
        </div>
      </motion.section>
      </div>

      {termsModal && (
        <TermsModal onClose={() => setTermsModal(false)} />
      )}

      <Modal
        isOpen={editModal}
        onClose={() => setEditModal(false)}
        title={t("profile.edit_profile")}
      >
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <ProfileAvatar
              displayName={user?.displayName}
              photoURL={user?.photoURL}
              size={80}
              ringClassName="ring-2 ring-[#6EA2FF]/40"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-[#3A66C1] shadow"
            >
              <EditIcon />
            </button>
          </div>
          {uploading && <p className="text-sm text-[#6D7D95]">{t("profile.uploading_photo")}</p>}
          <div className="w-full">
            <label className="mb-1 block text-sm font-medium text-[#202A3F]">{t("profile.display_name")}</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg border border-[#D9E1EE] bg-[#F3F8FF] px-4 py-3 text-[#202A3F] outline-none focus:border-[#3A66C1]"
              placeholder={t("profile.your_name")}
            />
          </div>
          <div className="flex w-full gap-3">
            <Button variant="secondary" onClick={() => setEditModal(false)} className="flex-1">
              {t("profile.cancel")}
            </Button>
            <Button onClick={handleSaveProfile} disabled={saving} className="flex-1">
              {saving ? t("profile.saving") : t("profile.save")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteModal}
        onClose={() => !deletingAccount && setDeleteModal(false)}
        title={t("profile.delete_account")}
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-[#D9485F]/14 bg-rose-50/70 px-4 py-3 text-sm text-[#6A2D38]">
            <p className="font-semibold text-[#B43C52]">{t("profile.delete_confirm")}</p>
            <p className="mt-2">
              {t("profile.delete_account_description")}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setDeleteModal(false)}
              className="flex-1"
              disabled={deletingAccount}
            >
              {t("profile.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              className="flex-1"
              disabled={deletingAccount}
            >
              {deletingAccount
                ? t("profile.deleting_account")
                : t("profile.delete_account")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
