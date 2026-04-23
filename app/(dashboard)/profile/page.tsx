'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTheme } from '@/lib/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { motion } from 'motion/react';
import Link from 'next/link';

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const router = useRouter();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      showToast('Profile photo updated!', 'success');
    } catch { showToast('Upload failed', 'error'); }
    finally { setUploading(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { showToast('Passwords do not match', 'error'); return; }
    if (newPw.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
    if (!user?.email) return;
    setPwLoading(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      showToast('Password updated!', 'success');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwModal(false);
    } catch { showToast('Failed to update password', 'error'); }
    finally { setPwLoading(false); }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
      // Purge analytics rows first — once the Firebase user is gone we can't
      // prove ownership, so the backend cascade must run before deleteUser().
      const idToken = await user.getIdToken();
      await fetch(`/api/users/${user.uid}/data`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      await deleteUser(user);
      router.push('/sign-in');
    } catch { showToast('Failed to delete account. Please re-login and try again.', 'error'); }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-white">{t('profile.title')}</h1>

      {/* Account Info */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">{t('profile.account_info')}</h2>
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer group">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white overflow-hidden">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2h19.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
              )}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {uploading ? <span className="text-xs text-white">...</span> : <span className="text-xs text-white">📷</span>}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </label>
          <div>
            <p className="text-lg font-semibold text-white">{user?.displayName || 'User'}</p>
            <p className="text-sm text-gray-400">{user?.email}</p>
          </div>
        </div>
      </motion.section>

      {/* Theme & Language */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-2xl border border-white/5 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">{t('profile.website_config')}</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-2 block">{t('profile.theme')}</label>
            <div className="flex gap-3">
              {(['dark', 'light'] as const).map(th => (
                <button key={th} onClick={() => setTheme(th)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${theme === th ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                  {th === 'dark' ? '🌙 ' + t('profile.dark_mode') : '☀️ ' + t('profile.light_mode')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-2 block">{t('profile.language')}</label>
            <div className="flex gap-3">
              {[{ code: 'en', label: '🇺🇸 English' }, { code: 'th', label: '🇹🇭 ไทย' }].map(l => (
                <button key={l.code} onClick={() => handleLanguageChange(l.code)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${i18n.language === l.code ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Change Password */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-2xl border border-white/5 bg-white/5 p-6 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">{t('profile.change_password')}</h2>
          <p className="text-sm text-gray-400 mt-0.5">Update your account password</p>
        </div>
        <Button variant="secondary" onClick={() => setPwModal(true)}>{t('profile.change_password')}</Button>
      </motion.section>

      {/* Terms & Privacy */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="rounded-2xl border border-white/5 bg-white/5 p-6 space-y-2">
        <Link href="/terms" className="flex items-center justify-between py-2 text-gray-300 hover:text-white transition-colors">
          <span>{t('profile.terms')}</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </Link>
        <Link href="/privacy" className="flex items-center justify-between py-2 text-gray-300 hover:text-white transition-colors">
          <span>{t('profile.privacy')}</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </Link>
      </motion.section>

      {/* Danger Zone */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
        <Button variant="danger" onClick={() => setDeleteModal(true)}>{t('profile.delete_account')}</Button>
      </motion.section>

      <Modal isOpen={pwModal} onClose={() => { setPwModal(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }} title={t('profile.change_password')}>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <Input label={t('profile.current_password')} type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
          <Input label={t('profile.new_password')} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required />
          <Input label={t('profile.confirm_new')} type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => { setPwModal(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }} className="flex-1">{t('profile.cancel')}</Button>
            <Button type="submit" loading={pwLoading} className="flex-1">{t('profile.update_password')}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} title={t('profile.delete_account')}>
        <p className="text-gray-400 mb-4">{t('profile.delete_confirm')}</p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setDeleteModal(false)} className="flex-1">{t('profile.cancel')}</Button>
          <Button variant="danger" onClick={handleDeleteAccount} className="flex-1">{t('profile.delete_account')}</Button>
        </div>
      </Modal>
    </div>
  );
}
