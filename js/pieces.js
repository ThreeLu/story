// 「关于我」展示柜里的展品：每一条是一件线描的小物件（写死的 SVG，不含用户数据，可以放心用 innerHTML）。
// 默认按话题猜一件（guessPiece），也可以自己换（about[].icon）。

export const PIECES = {
  person: ['人', '<circle cx="12" cy="7" r="3.2"/><path d="M5.5 20c.6-4 3.2-6.2 6.5-6.2s5.9 2.2 6.5 6.2"/>'],
  house: ['房子', '<path d="M4 11 12 4.5 20 11"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/>'],
  pin: ['地标', '<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11Z"/><circle cx="12" cy="10" r="2.2"/>'],
  mirror: ['镜子', '<ellipse cx="12" cy="9.5" rx="5" ry="6.5"/><path d="M12 16v4M8.5 20.5h7"/><path d="M9.6 7.2c.6-1.1 1.4-1.7 2.4-1.9"/>'],
  chat: ['对话', '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V16h0A2.5 2.5 0 0 1 4 13.5Z"/><path d="M8.5 9h7M8.5 12h4"/>'],
  eye: ['眼睛', '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/>'],
  perfume: ['香水瓶', '<rect x="6.5" y="9" width="11" height="11.5" rx="2.5"/><path d="M10 9V6.5h4V9M9.5 4h5"/><path d="M9.5 13.5h5"/>'],
  leaf: ['叶子', '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>'],
  hourglass: ['沙漏', '<path d="M6.5 3.5h11M6.5 20.5h11M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 5-8 8.5s8 3.5 8 8.5"/><path d="M10 18.5h4"/>'],
  scale: ['天平', '<path d="M12 4v16M8 20.5h8M5 7.5h14"/><path d="M5 7.5 2.8 13a2.3 2.3 0 0 0 4.4 0ZM19 7.5 16.8 13a2.3 2.3 0 0 0 4.4 0Z"/>'],
  compass: ['指南针', '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/><path d="M12 3.5v1.5M12 19v1.5"/>'],
  heart: ['心', '<path d="M12 19.5C6.5 15.5 4 12.5 4 9.2a4 4 0 0 1 8-1.2 4 4 0 0 1 8 1.2c0 3.3-2.5 6.3-8 10.3Z"/>'],
  glass: ['酒杯', '<path d="M7 3.5h10l-1 6a4 4 0 0 1-8 0Z"/><path d="M12 13.5v6M8.5 20.5h7M7.6 7h8.8"/>'],
  shoe: ['跑鞋', '<path d="M3.5 16 5 8.5l4 1.5 2 2.5 5 1.2a3.6 3.6 0 0 1 3.5 3.3H3.5Z"/><path d="M3.5 18.5h16.5M7 12.5l1.5.6M9 14.5l1.5.4"/>'],
  frame: ['相框', '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="m4 16 4.5-4.5 3.5 3.5 2.5-2.5L20 18"/><circle cx="15.5" cy="8.5" r="1.5"/>'],
  notebook: ['日记本', '<rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/><path d="M8.5 3.5v17M11 8h5M11 11.5h5"/>'],
  pen: ['钢笔', '<path d="M14.5 4.5 19.5 9.5 10 19H5v-5Z"/><path d="m12.5 6.5 5 5M5 19l4-4"/>'],
  city: ['城市', '<path d="M3.5 20.5h17M5 20.5V11l4-2.5v12M9 20.5V6l6-2.5v17M15 20.5V10l4 2v8.5M11.5 9h1M11.5 12h1M11.5 15h1"/>'],
  palette: ['调色板', '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.1-.5-1.3.4-2.4 1.8-2.4h1.6a3.5 3.5 0 0 0 3.5-3.5C20.5 7.3 16.7 3.5 12 3.5Z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/>'],
  record: ['唱片', '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 6a6 6 0 0 0-6 6M18 12a6 6 0 0 1-6 6"/>'],
  hanger: ['衣架', '<path d="M10.2 6a1.9 1.9 0 1 1 1.8 2"/><path d="M12 8v1L3.6 15.4A1.4 1.4 0 0 0 4.4 18h15.2a1.4 1.4 0 0 0 .8-2.6L12 9"/>'],
  camera: ['相机', '<rect x="3.5" y="7" width="17" height="12" rx="2"/><path d="M8.5 7 10 4.5h4L15.5 7"/><circle cx="12" cy="13" r="3.3"/>'],
  tv: ['电视', '<rect x="3.5" y="5.5" width="17" height="11.5" rx="1.5"/><path d="M9 20.5h6M12 17v3.5M9 2.5l3 3 3-3"/>'],
  map: ['地图', '<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2Z"/><path d="M9 4.5v13M15 6.5v13"/>'],
  books: ['一摞书', '<path d="M4 20.5V5h3.5v15.5M7.5 20.5V7.5H11v13M11.5 20.5l3-14 3.4.7-3 13.3"/><path d="M3 20.5h18"/>'],
  no: ['禁止', '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>'],
  megaphone: ['喇叭', '<path d="M4 10v4h3l7 4V6l-7 4Z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5M7 14l1 5h2.5l-1-4.2"/>'],
  box: ['收纳盒', '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v10.5h14V9M10 12.5h4"/>'],
  bottle: ['瓶子', '<path d="M9.5 3.5h5v3h-5z"/><path d="M8 9a2.5 2.5 0 0 1 2.5-2.5h3A2.5 2.5 0 0 1 16 9v10a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 19Z"/><path d="M8 12.5h8"/>'],
  coin: ['钱币', '<circle cx="12" cy="12" r="8.5"/><path d="M9 7.5 12 11l3-3.5M12 11v6M9.5 12.5h5M9.5 15h5"/>'],
  globe: ['地球仪', '<circle cx="12" cy="10" r="6.5"/><path d="M5.5 10h13M12 3.5a10 10 0 0 1 0 13M12 3.5a10 10 0 0 0 0 13M12 16.5v3M8.5 20.5h7"/>'],
  face: ['脸', '<circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01M9 15a4 4 0 0 0 6 0"/>'],
  thermometer: ['体温计', '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a3.8 3.8 0 1 1-4 0Z"/><path d="M12 9v7.5"/>'],
  cloud: ['云', '<path d="M7 18.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.4A3.3 3.3 0 0 1 17 18.5Z"/>'],
  figure: ['小人像', '<circle cx="12" cy="4.5" r="2"/><path d="M12 7v7M8 10.5l4-2 4 2M9.5 21l2.5-7 2.5 7"/>'],
  cross: ['十字架', '<path d="M12 3v18M7 8.5h10"/><path d="M9.5 21h5"/>'],
  feather: ['羽毛笔', '<path d="M19.5 4.5C12 5 7 10 6 18.5"/><path d="M19.5 4.5c-1 6-5 10.5-12 12.5M10.5 11h4.5M8.8 14h3.7M6 18.5 4.5 20"/>'],
  signpost: ['路牌', '<path d="M12 3v18M8 21h8"/><path d="M12 5.5h6.5l2 2-2 2H12M12 11.5H5.5l-2 2 2 2H12"/>'],
  candle: ['蜡烛', '<path d="M9 10h6v11H9zM12 10V7"/><path d="M12 2.5c1.3 1.4 1.8 2.4 1.2 3.4a1.4 1.4 0 0 1-2.4 0c-.6-1 0-2 1.2-3.4Z"/>'],
};

// 按话题和内容猜一件；先比话题，话题猜不出再比所在的栏目
const GUESS = [
  [/^我$|名字/, 'person'], [/家乡|老家|出生/, 'house'], [/现在/, 'pin'], [/顺从|做自己/, 'mirror'], [/交流|聊天|朋友/, 'chat'],
  [/看人|阅人/, 'eye'], [/气质|精致/, 'perfume'], [/过日子|生活方式/, 'leaf'], [/会变|变化|坚持/, 'hourglass'], [/底线|良知/, 'scale'],
  [/科研|方向|数学|研究/, 'compass'], [/恋爱|感情/, 'heart'], [/烟|酒/, 'glass'], [/运动|跑步|锻炼/, 'shoe'], [/回忆|过去/, 'frame'],
  [/日记/, 'notebook'], [/输出|写作/, 'pen'], [/城市|认知/, 'city'], [/颜色|风格/, 'palette'], [/民乐/, 'no'], [/音乐|古典|乐器/, 'record'],
  [/穿搭|衣服/, 'hanger'], [/缓过来|摄影|放松/, 'camera'], [/看的|电视|视频|剧/, 'tv'], [/济南|地方|旅行/, 'map'], [/书/, 'books'],
  [/口号|说教/, 'megaphone'], [/记下来|整理|收纳/, 'box'], [/护肤|保养/, 'bottle'], [/钱|理财/, 'coin'], [/英语|语言/, 'globe'],
  [/皮肤/, 'face'], [/生病|感冒/, 'thermometer'], [/心情|情绪/, 'cloud'], [/身材/, 'figure'], [/神|信仰|祷告|读经/, 'cross'],
  [/说话|语气/, 'feather'], [/指引|怎么做/, 'signpost'],
];
const BY_SEC = { basic: 'person', character: 'mirror', values: 'scale', views: 'compass', likes: 'heart', dislikes: 'no', habits: 'hourglass', body: 'figure', faith: 'candle', talk: 'feather' };

export function guessPiece(entry) {
  if (entry.icon && PIECES[entry.icon]) return entry.icon;
  for (const [re, name] of GUESS) if (re.test(entry.topic || '')) return name;
  return BY_SEC[entry.sec] || 'person';
}

export function pieceSvg(name, cls = 'piece-svg') {
  const span = document.createElement('span');
  span.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${(PIECES[name] || PIECES.person)[1]}</svg>`;
  return span.firstChild;
}
