"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { motion } from "motion/react";

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

function CheckMark({ active }: { active: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
        active
          ? "border-[#3C5FBA] bg-[#3C5FBA] text-white"
          : "border-[#C8D4E4] bg-white text-transparent"
      }`}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
      </svg>
    </span>
  );
}

export default function LanguagePage() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const handleSelect = async (language: "en" | "th") => {
    await i18n.changeLanguage(language);
    window.localStorage.setItem("novarquiz-language", language);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <BackButton onClick={() => router.push("/profile")} />

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="nq-card rounded-[28px] px-6 py-5"
      >
        <h1 className="text-[1.7rem] font-semibold text-[#202A3F]">{t("profile.language")}</h1>

        <div className="mt-5 space-y-6">
          <button
            type="button"
            onClick={() => handleSelect("en")}
            className="flex w-full items-center justify-between gap-4 text-left"
          >
            <div className="flex items-center gap-4">
              <span className="text-xl font-medium text-[#202A3F]">{t("language.english")}</span>
            </div>
            <CheckMark active={i18n.language === "en"} />
          </button>

          <button
            type="button"
            onClick={() => handleSelect("th")}
            className="flex w-full items-center justify-between gap-4 text-left"
          >
            <div className="flex items-center gap-4">
              <span className="text-xl font-medium text-[#202A3F]">{t("language.thai")}</span>
            </div>
            <CheckMark active={i18n.language === "th"} />
          </button>
        </div>
      </motion.section>

      <p className="text-center text-[1.05rem] font-medium text-[#6A7485]">
        {t("language.description")}
      </p>
    </div>
  );
}
