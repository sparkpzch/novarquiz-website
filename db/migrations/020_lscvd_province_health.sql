-- 020_lscvd_province_health.sql
-- Province of residence for the admin province map, and an opt-in heart and
-- blood-lipid (LSCVD) self-report kept in its own table under a separate
-- explicit consent. Rows are deleted when that consent is withdrawn.

CREATE TABLE IF NOT EXISTS th_provinces (
  code text PRIMARY KEY CHECK (code ~ '^TH-[0-9]{2}$'),
  name_th text NOT NULL,
  name_en text NOT NULL,
  region text NOT NULL CHECK (region IN ('bangkok_metro','central','north','northeast','east','west','south'))
);

-- Mirrors lib/onboarding/provinces.ts.
INSERT INTO th_provinces (code, name_th, name_en, region) VALUES
  ('TH-10', 'กรุงเทพมหานคร', 'Bangkok', 'bangkok_metro'),
  ('TH-11', 'สมุทรปราการ', 'Samut Prakan', 'bangkok_metro'),
  ('TH-12', 'นนทบุรี', 'Nonthaburi', 'bangkok_metro'),
  ('TH-13', 'ปทุมธานี', 'Pathum Thani', 'bangkok_metro'),
  ('TH-14', 'พระนครศรีอยุธยา', 'Phra Nakhon Si Ayutthaya', 'central'),
  ('TH-15', 'อ่างทอง', 'Ang Thong', 'central'),
  ('TH-16', 'ลพบุรี', 'Lop Buri', 'central'),
  ('TH-17', 'สิงห์บุรี', 'Sing Buri', 'central'),
  ('TH-18', 'ชัยนาท', 'Chai Nat', 'central'),
  ('TH-19', 'สระบุรี', 'Saraburi', 'central'),
  ('TH-20', 'ชลบุรี', 'Chon Buri', 'east'),
  ('TH-21', 'ระยอง', 'Rayong', 'east'),
  ('TH-22', 'จันทบุรี', 'Chanthaburi', 'east'),
  ('TH-23', 'ตราด', 'Trat', 'east'),
  ('TH-24', 'ฉะเชิงเทรา', 'Chachoengsao', 'east'),
  ('TH-25', 'ปราจีนบุรี', 'Prachin Buri', 'east'),
  ('TH-26', 'นครนายก', 'Nakhon Nayok', 'central'),
  ('TH-27', 'สระแก้ว', 'Sa Kaeo', 'east'),
  ('TH-30', 'นครราชสีมา', 'Nakhon Ratchasima', 'northeast'),
  ('TH-31', 'บุรีรัมย์', 'Buri Ram', 'northeast'),
  ('TH-32', 'สุรินทร์', 'Surin', 'northeast'),
  ('TH-33', 'ศรีสะเกษ', 'Si Sa Ket', 'northeast'),
  ('TH-34', 'อุบลราชธานี', 'Ubon Ratchathani', 'northeast'),
  ('TH-35', 'ยโสธร', 'Yasothon', 'northeast'),
  ('TH-36', 'ชัยภูมิ', 'Chaiyaphum', 'northeast'),
  ('TH-37', 'อำนาจเจริญ', 'Amnat Charoen', 'northeast'),
  ('TH-38', 'บึงกาฬ', 'Bueng Kan', 'northeast'),
  ('TH-39', 'หนองบัวลำภู', 'Nong Bua Lam Phu', 'northeast'),
  ('TH-40', 'ขอนแก่น', 'Khon Kaen', 'northeast'),
  ('TH-41', 'อุดรธานี', 'Udon Thani', 'northeast'),
  ('TH-42', 'เลย', 'Loei', 'northeast'),
  ('TH-43', 'หนองคาย', 'Nong Khai', 'northeast'),
  ('TH-44', 'มหาสารคาม', 'Maha Sarakham', 'northeast'),
  ('TH-45', 'ร้อยเอ็ด', 'Roi Et', 'northeast'),
  ('TH-46', 'กาฬสินธุ์', 'Kalasin', 'northeast'),
  ('TH-47', 'สกลนคร', 'Sakon Nakhon', 'northeast'),
  ('TH-48', 'นครพนม', 'Nakhon Phanom', 'northeast'),
  ('TH-49', 'มุกดาหาร', 'Mukdahan', 'northeast'),
  ('TH-50', 'เชียงใหม่', 'Chiang Mai', 'north'),
  ('TH-51', 'ลำพูน', 'Lamphun', 'north'),
  ('TH-52', 'ลำปาง', 'Lampang', 'north'),
  ('TH-53', 'อุตรดิตถ์', 'Uttaradit', 'north'),
  ('TH-54', 'แพร่', 'Phrae', 'north'),
  ('TH-55', 'น่าน', 'Nan', 'north'),
  ('TH-56', 'พะเยา', 'Phayao', 'north'),
  ('TH-57', 'เชียงราย', 'Chiang Rai', 'north'),
  ('TH-58', 'แม่ฮ่องสอน', 'Mae Hong Son', 'north'),
  ('TH-60', 'นครสวรรค์', 'Nakhon Sawan', 'central'),
  ('TH-61', 'อุทัยธานี', 'Uthai Thani', 'central'),
  ('TH-62', 'กำแพงเพชร', 'Kamphaeng Phet', 'central'),
  ('TH-63', 'ตาก', 'Tak', 'west'),
  ('TH-64', 'สุโขทัย', 'Sukhothai', 'central'),
  ('TH-65', 'พิษณุโลก', 'Phitsanulok', 'central'),
  ('TH-66', 'พิจิตร', 'Phichit', 'central'),
  ('TH-67', 'เพชรบูรณ์', 'Phetchabun', 'central'),
  ('TH-70', 'ราชบุรี', 'Ratchaburi', 'west'),
  ('TH-71', 'กาญจนบุรี', 'Kanchanaburi', 'west'),
  ('TH-72', 'สุพรรณบุรี', 'Suphan Buri', 'central'),
  ('TH-73', 'นครปฐม', 'Nakhon Pathom', 'bangkok_metro'),
  ('TH-74', 'สมุทรสาคร', 'Samut Sakhon', 'bangkok_metro'),
  ('TH-75', 'สมุทรสงคราม', 'Samut Songkhram', 'central'),
  ('TH-76', 'เพชรบุรี', 'Phetchaburi', 'west'),
  ('TH-77', 'ประจวบคีรีขันธ์', 'Prachuap Khiri Khan', 'west'),
  ('TH-80', 'นครศรีธรรมราช', 'Nakhon Si Thammarat', 'south'),
  ('TH-81', 'กระบี่', 'Krabi', 'south'),
  ('TH-82', 'พังงา', 'Phang Nga', 'south'),
  ('TH-83', 'ภูเก็ต', 'Phuket', 'south'),
  ('TH-84', 'สุราษฎร์ธานี', 'Surat Thani', 'south'),
  ('TH-85', 'ระนอง', 'Ranong', 'south'),
  ('TH-86', 'ชุมพร', 'Chumphon', 'south'),
  ('TH-90', 'สงขลา', 'Songkhla', 'south'),
  ('TH-91', 'สตูล', 'Satun', 'south'),
  ('TH-92', 'ตรัง', 'Trang', 'south'),
  ('TH-93', 'พัทลุง', 'Phatthalung', 'south'),
  ('TH-94', 'ปัตตานี', 'Pattani', 'south'),
  ('TH-95', 'ยะลา', 'Yala', 'south'),
  ('TH-96', 'นราธิวาส', 'Narathiwat', 'south')
ON CONFLICT (code) DO UPDATE SET name_th = EXCLUDED.name_th, name_en = EXCLUDED.name_en, region = EXCLUDED.region;

-- NULL = not answered (older survey version) or "prefer not to say".
ALTER TABLE participant_surveys
  ADD COLUMN IF NOT EXISTS province_code text REFERENCES th_provinces(code);
CREATE INDEX IF NOT EXISTS participant_surveys_province_idx ON participant_surveys (province_code);

CREATE TABLE IF NOT EXISTS participant_health_profiles (
  uid text PRIMARY KEY REFERENCES profiles(uid) ON DELETE CASCADE,
  waist_cm numeric CHECK (waist_cm BETWEEN 30 AND 250),
  smoking text NOT NULL CHECK (smoking IN ('never','former','current','unknown')),
  hypertension text NOT NULL CHECK (hypertension IN ('yes','no','unknown')),
  diabetes text NOT NULL CHECK (diabetes IN ('yes','no','unknown')),
  high_cholesterol text NOT NULL CHECK (high_cholesterol IN ('yes','no','unknown')),
  lipid_check text NOT NULL CHECK (lipid_check IN ('within_1y','within_5y','over_5y','never','unknown')),
  ldl_range text NOT NULL CHECK (ldl_range IN ('lt70','70_99','100_129','130_159','160_189','gte190','unknown')),
  lipid_medication text NOT NULL CHECK (lipid_medication IN ('yes','no','unknown')),
  family_history text NOT NULL CHECK (family_history IN ('yes','no','unknown')),
  prior_event text NOT NULL CHECK (prior_event IN ('yes','no','unknown')),
  survey_version text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
