// All records in this file are fictional fixtures for automated checks.
// Synthetic travel records for explicit live assistant checks. No personal data.
const scope='海岛验收旅程';
const entries=[
{id:'test-day18',date:'2031-10-18',trip:scope,title:'海钓与码头午餐',content:'上午出海海钓，回到码头后在星屿小馆吃午饭。咖喱很好吃，分量也足。吃完沿灯塔步道散步，在海边看了日落。晚上住在海风旅馆。注意，回程最后一班船是18:00，要提前确认船班。'},
{id:'test-day19',date:'2031-10-19',trip:scope,title:'雨天的集市',content:'上午下雨，坐船去市区逛集市，买了纪念品。午后喝咖啡，晚上参加了演出。纪念品店不收美元现金，要准备银行卡。'},
{id:'test-day20',date:'2031-10-20',trip:scope,title:'离开海岛',content:'上午在海边吃饭，之后去机场。没有再购物。'},
{id:'other-trip',date:'2030-10-18',trip:'京都验收旅程',title:'京都',content:'住在松林旅馆，房间号是818。这是另一次旅行。'}
];
const expense=(id,date,category,amount,currency,payMethod,note,trip=scope)=>({id,date,category,amount,currency,payMethod,note,trip});
const fixture={entries,expenses:[
expense('e1','2031-10-18','餐饮',128,'CNY','cash','星屿小馆午餐'),
expense('e2','2031-10-18','交通',72,'CNY','online','海钓接驳车'),
expense('e3','2031-10-18','住宿',500,'CNY','visa','海风旅馆'),
expense('e4','2031-10-19','交通',40,'USD','cash','市区往返船票'),
expense('e5','2031-10-19','购物',300,'MVR','visa','集市纪念品'),
expense('e6','2031-10-19','餐饮',60,'CNY','online','集市咖啡'),
expense('e7','2031-10-19','娱乐',90,'CNY','visa','海边演出'),
expense('e8','2031-10-20','餐饮',100,'CNY','cash','海边用餐'),
expense('other','2030-10-18','住宿',3999,'CNY','visa','松林旅馆','京都验收旅程')],rates:{CNY:1,USD:7,MVR:.5},budget:6000,chat:[]};

export {scope,fixture};
