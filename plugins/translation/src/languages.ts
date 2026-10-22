/** Volcengine text-translation language table, reviewed 2026-10-22.
 * https://docs.volcengine.com/docs/MachineTranslation/Languagesupport?lang=zh
 * Provider codes and direction restrictions are a release snapshot, not detection guarantees.
 */
const rows = [
  ['zh', 'Chinese (simplified)', '中文（简体）'],
  ['zh-Hant', 'Chinese (traditional)', '中文（繁体）'],
  ['zh-Hant-hk', 'Chinese (Hong Kong traditional)', '中文（香港繁体）'],
  ['zh-Hant-tw', 'Chinese (Taiwan traditional)', '中文（台湾繁体）'],
  ['tn', 'Tswana', '札那语'],
  ['vi', 'Vietnamese', '越南语'],
  ['iu', 'Inuktitut', '伊努克提图特语'],
  ['it', 'Italian', '意大利语'],
  ['id', 'Indonesian', '印尼语'],
  ['hi', 'Hindi', '印地语'],
  ['en', 'English', '英语'],
  ['ho', 'Hiri Motu', '希里莫图语'],
  ['he', 'Hebrew', '希伯来语'],
  ['es', 'Spanish', '西班牙语'],
  ['el', 'Modern Greek', '现代希腊语'],
  ['uk', 'Ukrainian', '乌克兰语'],
  ['ur', 'Urdu', '乌尔都语'],
  ['tk', 'Turkmen', '土库曼语'],
  ['tr', 'Turkish', '土耳其语'],
  ['ti', 'Tigrinya', '提格里尼亚语'],
  ['ty', 'Tahitian', '塔希提语'],
  ['tl', 'Tagalog', '他加禄语'],
  ['to', 'Tongan', '汤加语'],
  ['th', 'Thai', '泰语'],
  ['ta', 'Tamil', '泰米尔语'],
  ['te', 'Telugu', '泰卢固语'],
  ['sl', 'Slovenian', '斯洛文尼亚语'],
  ['sk', 'Slovak', '斯洛伐克语'],
  ['ss', 'Swati', '史瓦帝语'],
  ['eo', 'Esperanto', '世界语'],
  ['sm', 'Samoan', '萨摩亚语'],
  ['sg', 'Sango', '桑戈语'],
  ['st', 'Southern Sotho', '塞索托语'],
  ['sv', 'Swedish', '瑞典语'],
  ['ja', 'Japanese', '日语'],
  ['tw', 'Twi', '契维语'],
  ['qu', 'Quechua', '奇楚瓦语'],
  ['pt', 'Portuguese', '葡萄牙语'],
  ['pa', 'Punjabi', '旁遮普语'],
  ['no', 'Norwegian', '挪威语'],
  ['nb', 'Norwegian Bokmål', '挪威布克莫尔语'],
  ['nr', 'South Ndebele', '南恩德贝勒语'],
  ['my', 'Burmese', '缅甸语'],
  ['bn', 'Bengali', '孟加拉语'],
  ['mn', 'Mongolian', '蒙古语'],
  ['mh', 'Marshallese', '马绍尔语'],
  ['mk', 'Macedonian', '马其顿语'],
  ['ml', 'Malayalam', '马拉亚拉姆语'],
  ['mr', 'Marathi', '马拉提语'],
  ['ms', 'Malay', '马来语'],
  ['lu', 'Luba-Katanga', '卢巴卡丹加语'],
  ['ro', 'Romanian', '罗马尼亚语'],
  ['lt', 'Lithuanian', '立陶宛语'],
  ['lv', 'Latvian', '拉脱维亚语'],
  ['lo', 'Lao', '老挝语'],
  ['kj', 'Kwanyama', '宽亚玛语'],
  ['hr', 'Croatian', '克罗地亚语'],
  ['kn', 'Kannada', '坎纳达语'],
  ['ki', 'Kikuyu', '基库尤语'],
  ['cs', 'Czech', '捷克语'],
  ['ca', 'Catalan', '加泰隆语'],
  ['nl', 'Dutch', '荷兰语'],
  ['ko', 'Korean', '韩语'],
  ['ht', 'Haitian Creole', '海地克里奥尔语'],
  ['gu', 'Gujarati', '古吉拉特语'],
  ['ka', 'Georgian', '格鲁吉亚语'],
  ['kl', 'Greenlandic', '格陵兰语'],
  ['km', 'Khmer', '高棉语'],
  ['lg', 'Ganda', '干达语'],
  ['kg', 'Kongo', '刚果语'],
  ['fi', 'Finnish', '芬兰语'],
  ['fj', 'Fijian', '斐济语'],
  ['fr', 'French', '法语'],
  ['ru', 'Russian', '俄语'],
  ['ng', 'Ndonga', '恩敦加语'],
  ['de', 'German', '德语'],
  ['tt', 'Tatar', '鞑靼语'],
  ['da', 'Danish', '丹麦语'],
  ['ts', 'Tsonga', '聪加语'],
  ['cv', 'Chuvash', '楚瓦什语'],
  ['fa', 'Persian', '波斯语'],
  ['bs', 'Bosnian', '波斯尼亚语'],
  ['pl', 'Polish', '波兰语'],
  ['bi', 'Bislama', '比斯拉玛语'],
  ['nd', 'North Ndebele', '北恩德贝勒语'],
  ['ba', 'Bashkir', '巴什基尔语'],
  ['bg', 'Bulgarian', '保加利亚语'],
  ['az', 'Azerbaijani', '阿塞拜疆语'],
  ['ar', 'Arabic', '阿拉伯语'],
  ['af', 'Afrikaans', '阿非利堪斯语'],
  ['sq', 'Albanian', '阿尔巴尼亚语'],
  ['ab', 'Abkhazian', '阿布哈兹语'],
  ['os', 'Ossetian', '奥塞梯语'],
  ['ee', 'Ewe', '埃维语'],
  ['et', 'Estonian', '爱沙尼亚语'],
  ['ay', 'Aymara', '艾马拉语'],
  ['lzh', 'Chinese (classical)', '中文（文言文）'],
  ['am', 'Amharic', '阿姆哈拉语'],
  ['ckb', 'Central Kurdish', '中库尔德语'],
  ['cy', 'Welsh', '威尔士语'],
  ['gl', 'Galician', '加利西亚语'],
  ['ha', 'Hausa', '豪萨语'],
  ['hy', 'Armenian', '亚美尼亚语'],
  ['ig', 'Igbo', '伊博语'],
  ['kmr', 'Northern Kurdish', '北库尔德语'],
  ['ln', 'Lingala', '林加拉语'],
  ['nso', 'Northern Sotho', '北索托语'],
  ['ny', 'Chewa', '齐切瓦语'],
  ['om', 'Oromo', '奥洛莫语'],
  ['sn', 'Shona', '绍纳语'],
  ['so', 'Somali', '索马里语'],
  ['sr', 'Serbian', '塞尔维亚语'],
  ['sw', 'Swahili', '斯瓦希里语'],
  ['xh', 'Xhosa', '科萨语'],
  ['yo', 'Yoruba', '约鲁巴语'],
  ['zu', 'Zulu', '祖鲁语'],
  ['bo', 'Tibetan', '藏语'],
  ['nan', 'Hokkien', '闽南语'],
  ['wuu', 'Wuyue Chinese', '吴语'],
  ['yue', 'Cantonese', '粤语'],
  ['cmn', 'Southwestern Mandarin', '西南官话'],
  ['ug', 'Uighur', '维吾尔语'],
  ['fuv', 'Nigerian Fulfulde', '尼日利亚富拉语'],
  ['hu', 'Hungarian', '匈牙利语'],
  ['kam', 'Kamba', '坎巴语'],
  ['luo', 'Dholuo', '肯尼亚语'],
  ['rw', 'Kinyarwanda', '基尼阿万达语'],
  ['umb', 'Umbundu', '卢欧语'],
  ['wo', 'Wolof', '沃洛夫语'],
] as const;

export type LanguageCode = (typeof rows)[number][0];
export interface LanguageEntry {
  readonly code: LanguageCode;
  readonly en: string;
  readonly zh: string;
  readonly source: boolean;
  readonly target: boolean;
  readonly targetOnly?: 'zh';
}

const chineseOnlySources: ReadonlySet<string> = new Set(['bo', 'nan', 'wuu', 'yue', 'cmn', 'ug']);
export const LANGUAGE_CATALOG: readonly LanguageEntry[] = Object.freeze(
  rows.map(([code, en, zh]) =>
    Object.freeze({
      code,
      en,
      zh,
      source: code !== 'sk',
      target: !chineseOnlySources.has(code),
      ...(chineseOnlySources.has(code) ? { targetOnly: 'zh' as const } : {}),
    }),
  ),
);

export const isSourceLanguage = (code: string): code is LanguageCode =>
  LANGUAGE_CATALOG.some((language) => language.code === code && language.source);
export const isTargetLanguage = (code: string): code is LanguageCode =>
  LANGUAGE_CATALOG.some((language) => language.code === code && language.target);
export const isSupportedDirection = (source: string, target: string): boolean =>
  isTargetLanguage(target) &&
  (source === 'auto' || (isSourceLanguage(source) && (!chineseOnlySources.has(source) || target === 'zh')));
export const languageLabel = (code: string, locale: string): string => {
  const language = LANGUAGE_CATALOG.find((entry) => entry.code === code);
  return language === undefined ? code : locale === 'zh-CN' ? language.zh : language.en;
};
export const defaultTargetLanguage = (locale: string): 'en' | 'zh' => (locale === 'zh-CN' ? 'zh' : 'en');
