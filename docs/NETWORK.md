# 联网协议合同

本地开发 Vite 代理 `/ws` → ws://localhost:8787。生产 Node 服务端同端口提供 dist 静态文件和 /ws WebSocket；npm run dev 同时启动二者，npm run start 启动生产服务。局域网设备可通过主机IP访问；公网需要将该服务部署到可访问主机。用户没有提供外网部署地址，不声称本地服务已开放公网。

客户端 localStorage 生成并持久化不易猜测的 clientId（crypto.randomUUID）。WebSocket 连接建立后先发送 hello；身份令牌只保存在自己的客户端，不在 room 广播其他人的 clientId。服务端持有权威 GameState，验证动作归属、回合、交易响应者，客户端不自改状态。客户端 playerId 为加入房间时分配的 seatId，在 start 的 players 顺序映射到 engine player.id，服务端 snapshot 返回自己的 youPlayerId。

```ts
type RoomMember = {seatId:string; name:string; color:string; shape:Shape; ai:boolean; personality:Personality; ready:boolean; connected:boolean; host:boolean};
type RoomSnapshot = {code:string; members:RoomMember[]; config: {mapId:MapId;seasons:number;weatherMode:'standard'|'challenge';seed:number;propertyTrading?:boolean}; started:boolean; state:GameState|null; movementUntil?:number; youSeatId:string; youPlayerId:string|null; isHost:boolean};
// client -> server
{type:'hello',clientId:string}
{type:'create',profile:PlayerConfig,config:{mapId,seasons,weatherMode,seed,propertyTrading?}}
{type:'join',code:string,profile:PlayerConfig}
{type:'reconnect',code:string}
{type:'profile',profile:PlayerConfig}
{type:'config',config:{mapId,seasons,weatherMode,seed,propertyTrading?}} // 仅房主、未开局
{type:'ready',ready:boolean}
{type:'addBot',profile:PlayerConfig} // 仅房主、<4席位
{type:'remove',seatId:string} // 仅房主、不可删除自己
{type:'start'} // 仅房主，2–4席位、人类均ready，房主自动ready
{type:'action',action:GameAction}
{type:'action',action:{type:'listProperty',nodeId:number,price:number}}
{type:'action',action:{type:'cancelListing',listingId:string}}
{type:'action',action:{type:'buyListing',listingId:string}}
{type:'leave'}
// server -> client
{type:'hello'}
{type:'room',room:RoomSnapshot}
{type:'error',message:string}
{type:'left'}
```

服务端广播整份规则状态；产品只在自己的HUD展示资产，其他人按钮收起。clientId令牌不包含在广播。网络回合不依赖客户端的animationComplete；前后端共用 `getMovementTimeline`，服务端锁定到该演出时长加300毫秒。演出依次为掷骰、原始点数、天气骰点修正、正常逐格移动、天气追加移动及落点反馈；人类也不可在锁定期间提前发送后续动作。runAI每次一步。

控骰器通过 `useItem` 的 `diceValue` 传入1～6的整数，由服务端检查道具、受潮、回合与骰具互斥；确认后通过 `controlledRoll` 同步，掷骰时写入 `movement.controlled`。租金提示 `pending.kind='rent'` 仅付款玩家可提交 `use_card` 或 `pay`，结算结果以结构化通知同步。当前回合偶遇存放在 `turnEncounters`，所有房间成员可见故事、选项和选定结果，回合结束后清空并保留历史通知。

`propertyTrading` 是可选布尔值，省略时服务端归一为 `true` 并在房间快照中广播；仅房主能在开局前通过 `config` 切换，开局后不可改。关闭时，挂牌动作和指定买家的旧式 `offerTrade` 都不可用。`state.propertyListings` 保存有效挂牌；挂牌价格为正整数，买方提交 `buyListing` 后由服务端一次性交割现金与产权，不收手续费。卖方可提交 `cancelListing` 撤销。客户端不得在消息或 `action` 中传 `actorId`：服务端根据已认证 socket 的席位确定玩家身份，只有挂牌、撤销、购买三种市场动作把该身份作为规则引擎的操作者。

这三种市场动作允许非当前回合玩家在 `ready` 或 `end` 阶段操作，但必须没有待处理决定、季报、移动演出锁或真人断线，破产玩家也不可操作。普通回合动作继续由当前玩家执行。每笔有效市场操作广播新状态；重复购买已失效的挂牌不会再次成交。非当前玩家的市场操作不会重置已安排的人机行动计时，人机届时读取最新状态。

开局前主人可配置地图/年份/天气/房产自由交易并增加有名人机。其他真人点击准备；房主也可在不足人数时补人机。断线保留座位、牌局暂停到该真人回来；不擅自把真人变成人机。相同clientId+房间码可恢复身份。主动离开游戏要明确说明离开不会替自己行动。房主离开则移交在线真人（无真人时回收房间）。房间需有最大数量、消息大小/频率约束、6位随机代码、不允许访客操控别人的turn、非法参数错误而非服务崩溃。旧式交易的 `pending.kind='trade'` 仅由 `pending.data.buyerId` 对应的真人回应。同一玩家多开连接应让最新连接接管，避免旧socket断线覆盖新连接状态。

功能验收至少两独立WebSocket客户端：创建/加入/准备/补AI/开始；非房主start被拒、非当前玩家roll被拒；断线重连；一次骰子同步所有客户端；真人交易只买方回应。还须验证房主切换交易开关同步、非本人挂牌被拒、非当前玩家购买即时广播、并发双买仅一次成交，以及断线和演出期间的交易锁。
