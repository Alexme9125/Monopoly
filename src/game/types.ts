export type MapId = 'lake' | 'coast' | 'valley' | 'sundered' | 'forest' | 'starSands';
export type EventRarity = 'common' | 'uncommon' | 'rare';
export type Personality = 'cautious' | 'balanced' | 'aggressive';
export type AILevel = 'gentle' | 'fierce';
export type RentLevel = 'relaxed' | 'standard' | 'heavy';
export type Shape = 'diamond' | 'circle' | 'hexagon' | 'triangle';
export type TileKind = 'start' | 'land' | 'empty' | 'coin' | 'event' | 'hospital' | 'prison' | 'sanatorium' | 'parking' | 'power' | 'water' | 'telecom' | 'station' | 'shop' | 'casino' | 'exchange';
export interface MapNode { id: number; x: number; y: number; name: string; kind: TileKind; price?: number; district?: string; neighbors: number[]; }
export interface MapData { id: MapId; name: string; subtitle: string; description: string; width: number; height: number; nodes: MapNode[]; accent: string; }
export interface PlayerConfig { name: string; color: string; shape: Shape; ai: boolean; personality: Personality; aiLevel?: AILevel; }
export interface GameConfig { mapId: MapId; mode: 'pve' | 'pvp'; players: PlayerConfig[]; seasons: number; weatherMode: 'standard' | 'challenge'; seed: number; propertyTrading?: boolean; rentLevel?: RentLevel; }
export interface InventorySlot { uid: string; itemId: string; quantity: number; wet: boolean; }
export interface Player extends PlayerConfig { id: string; cash: number; stamina: number; mood: number; position: number; previousPosition: number | null; routeNextPosition?: number | null; travelProgress: number; inventory: InventorySlot[]; pawnedItems: { slot: InventorySlot; principal: number }[]; capacity: number; holdings: Record<string, number>; stockCostBasis?: Record<string, number>; confinement: null | { kind: 'hospital' | 'prison' | 'sanatorium' | 'parking'; remaining: number; }; statuses: { id: string; remaining: number }[]; bankrupt: boolean; }
export interface Property { ownerId: string; level: number; mortgaged: boolean; }
export interface PropertyListing { id: string; nodeId: number; sellerId: string; price: number; listedDay: number; }
export interface Stock { id: string; name: string; code: string; price: number; history: number[]; change: number; sector: string; }
export interface Choice { id: string; label: string; description?: string; disabled?: boolean; }
export interface CasinoResult { id: number; game: 'slots' | 'roulette'; outcome: 'cash' | 'item' | 'miss' | 'no_capacity' | 'win' | 'lose'; title: string; detail: string; stake: number; payout: number; net: number; itemId?: string; bet?: 'red' | 'black'; }
export interface Prompt { kind: string; title: string; body: string; choices: Choice[]; data?: Record<string, unknown>; casinoResult?: CasinoResult; }
export interface GameLog { id: number; day: number; text: string; tone: 'info' | 'good' | 'bad'; }
export interface GameNotice { id: number; day: number; kind: 'rent' | 'event' | 'milestone' | 'trade' | 'lottery'; title: string; body: string; tone: 'good' | 'bad' | 'info'; playerId: string; nodeId: number; amount?: number; recipientId?: string; }
export interface TurnEncounter { id: string; playerId: string; day: number; nodeId: number; eventId: string; title: string; story: string; tone: EventDef['tone']; choices: Choice[]; selectedChoiceId?: string; result?: string; }
export interface GameEffect { kind: 'cash' | 'stamina' | 'mood' | 'event' | 'building' | 'confinement'; label: string; tone: 'good' | 'bad' | 'info'; }
export interface MovementSegment { kind: 'normal' | 'weather' | 'transfer'; path: number[]; label?: string; }
export interface Movement { id: number; playerId: string; path: number[]; roll: number; rolls?: number[]; face?: number; modifier: number; segments?: MovementSegment[]; dice?: boolean; controlled?: boolean; effects?: GameEffect[]; }
export interface GameFeedback { id: number; playerId: string; nodeId: number; effects: GameEffect[]; }
export interface SeasonReport { season: number; day: number; rankings: { id: string; name: string; assets: number; color: string }[]; }
export interface GameState { version: 1; mapLayoutVersion?: 1 | 2; config: GameConfig; players: Player[]; currentPlayerIndex: number; day: number; weatherId: string; weatherHistory?: string[]; properties: Record<number, Property>; propertyListings?: PropertyListing[]; encounters: number[]; turnEncounters?: TurnEncounter[]; stocks: Stock[]; logs: GameLog[]; notices?: GameNotice[]; phase: 'ready' | 'decision' | 'end' | 'gameover'; pending: Prompt | null; movement: Movement | null; feedback?: GameFeedback | null; seasonReport: SeasonReport | null; rng: number; sequence: number; winnerId: string | null; lastMarketEvent: string | null; selectedDie: number; controlledRoll?: number | null; twinRoll?: boolean; aiTurn?: { playerId: string; day: number; actions: number; attacks: number; purchases: number }; }
export interface ItemDef { id: string; name: string; icon: string; category: 'dice' | 'attack' | 'supply' | 'card' | 'special'; price: number; description: string; stackable: boolean; paper: boolean; susceptible: boolean; shop: boolean; target?: 'player' | 'property' | 'weather' | 'dice' | 'node'; }
export interface WeatherDef { id: string; name: string; family: 'clear' | 'frost' | 'rain' | 'heat' | 'wind' | 'fog' | 'disaster'; icon: string; description: string; balancedNote?: string; weight: number; seasons: number[]; }
export interface EventDef { id: string; title: string; story: string; tone: 'good' | 'bad' | 'choice'; mapId?: MapId; rarity?: EventRarity; dlc?: true; choices: { id: string; label: string; description: string; cash?: number; stamina?: number; mood?: number; item?: string; status?: string; confinement?: 'hospital' | 'prison' | 'sanatorium' | 'parking'; damageBuilding?: boolean; }[]; }
export interface GameAction { type: 'roll' | 'rest' | 'endTurn' | 'choose' | 'useItem' | 'discardItem' | 'stockTrade' | 'offerTrade' | 'mortgage' | 'redeem' | 'sellAsset' | 'pawnItem' | 'redeemItem' | 'dismissSeason' | 'listProperty' | 'cancelListing' | 'buyListing'; choiceId?: string; itemUid?: string; targetId?: string; nodeId?: number; stockId?: string; quantity?: number; price?: number; listingId?: string; weatherId?: string; diceValue?: number; }
