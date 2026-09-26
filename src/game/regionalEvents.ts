import type { EventDef } from './types';

/** Map-exclusive events transcribed verbatim from docs/regional-events-design.json. */
export const REGIONAL_EVENTS: EventDef[] = [
  {
    "id": "lake_reed_delivery",
    "mapId": "lake",
    "rarity": "common",
    "dlc": true,
    "title": "芦湾送信艇",
    "story": "芦湾的送信艇临时改走浅水航道，最后一批社区信件还留在岸边。邮递员请求你的代理人协助接驳，并准备了一笔跑腿费。",
    "tone": "good",
    "choices": [
      {
        "id": "lake_reed_delivery_carry",
        "label": "接驳邮袋",
        "description": "体力 -3，获得 320 PM$。",
        "stamina": -3,
        "cash": 320
      },
      {
        "id": "lake_reed_delivery_notify",
        "label": "通知岸边邮站",
        "description": "获得 160 PM$。",
        "cash": 160
      }
    ]
  },
  {
    "id": "lake_bridge_echo",
    "mapId": "lake",
    "rarity": "common",
    "dlc": true,
    "title": "短桥下的回声",
    "story": "镜湖短桥的桥拱能把琴声送到对岸。街头乐队正在采集这段独特的回声，邀请经过的代理人听一曲，或帮忙录制试音。",
    "tone": "good",
    "choices": [
      {
        "id": "lake_bridge_echo_listen",
        "label": "听完桥下演奏",
        "description": "心情 +12。",
        "mood": 12
      },
      {
        "id": "lake_bridge_echo_record",
        "label": "提供试音录音",
        "description": "获得 220 PM$。",
        "cash": 220
      }
    ]
  },
  {
    "id": "lake_meter_dispute",
    "mapId": "lake",
    "rarity": "common",
    "dlc": true,
    "title": "银栈水表争议",
    "story": "银栈旧街刚更换临时供水表，系统却把施工用水记在了你的接驳账户上。供水站允许先补缴这笔费用，也可以当场逐项核对账单。",
    "tone": "bad",
    "choices": [
      {
        "id": "lake_meter_dispute_pay",
        "label": "先行补缴",
        "description": "支付 240 PM$。",
        "cash": -240
      },
      {
        "id": "lake_meter_dispute_check",
        "label": "逐项核对账单",
        "description": "心情 -5，撤销误记费用。",
        "mood": -5
      }
    ]
  },
  {
    "id": "lake_ferry_queue",
    "mapId": "lake",
    "rarity": "common",
    "dlc": true,
    "title": "镜湖渡轮排队",
    "story": "镜湖渡轮检修，候船栈道上挤满了带行李的旅客。你的代理人可以在茶座缓口气，也可以帮站务员整理候船区域。",
    "tone": "choice",
    "choices": [
      {
        "id": "lake_ferry_queue_tea",
        "label": "在茶座等候",
        "description": "支付 150 PM$，心情 +8。",
        "cash": -150,
        "mood": 8
      },
      {
        "id": "lake_ferry_queue_help",
        "label": "整理候船栈道",
        "description": "体力 -3，获得 120 PM$。",
        "stamina": -3,
        "cash": 120
      }
    ]
  },
  {
    "id": "lake_lakeside_stall",
    "mapId": "lake",
    "rarity": "common",
    "dlc": true,
    "title": "星汀早餐试售",
    "story": "星汀水岸的新摊位正在试卖适合代理人随身携带的早餐。摊主愿意请你免费试吃，或用一杯打包咖啡换一份口味反馈。",
    "tone": "good",
    "choices": [
      {
        "id": "lake_lakeside_stall_taste",
        "label": "免费试吃",
        "description": "体力 +12。",
        "stamina": 12
      },
      {
        "id": "lake_lakeside_stall_review",
        "label": "填写试售反馈",
        "description": "获得 1 份晨星咖啡。",
        "item": "coffee"
      }
    ]
  },
  {
    "id": "lake_reflection_survey",
    "mapId": "lake",
    "rarity": "uncommon",
    "dlc": true,
    "title": "湖面反射测绘",
    "story": "镜湖的反射会让导航信标产生重影，测绘队正在重新校准岸线。你可以出资更换滤镜以换取一台校准装置，也可以让代理人参与采样。",
    "tone": "choice",
    "choices": [
      {
        "id": "lake_reflection_survey_fund",
        "label": "资助校准滤镜",
        "description": "支付 480 PM$，获得 1 个控骰器。",
        "cash": -480,
        "item": "controller"
      },
      {
        "id": "lake_reflection_survey_sample",
        "label": "协助人工采样",
        "description": "体力 -8，获得 650 PM$。",
        "stamina": -8,
        "cash": 650
      },
      {
        "id": "lake_reflection_survey_coords",
        "label": "提供岸线坐标",
        "description": "获得 220 PM$。",
        "cash": 220
      }
    ]
  },
  {
    "id": "lake_sunken_archive",
    "mapId": "lake",
    "rarity": "uncommon",
    "dlc": true,
    "title": "湖底租约箱",
    "story": "清淤船捞起了旧街租务所的档案箱，其中几页仍能辨认。档案馆愿意出资收回原箱；若你资助修复，还能获得旧街商户联合提供的免租凭证。",
    "tone": "choice",
    "choices": [
      {
        "id": "lake_sunken_archive_restore",
        "label": "修复受潮租页",
        "description": "支付 420 PM$，获得 1 张免租卡。",
        "cash": -420,
        "item": "rent"
      },
      {
        "id": "lake_sunken_archive_return",
        "label": "移交原箱",
        "description": "获得 280 PM$。",
        "cash": 280
      }
    ]
  },
  {
    "id": "lake_cable_alarm",
    "mapId": "lake",
    "rarity": "uncommon",
    "dlc": true,
    "title": "银栈地下电缆告警",
    "story": "银栈维护网发来告警：一段老电缆可能影响你名下普通建筑的地基。维修队建议立即加固，或请代理人协助隔离；延后检修则可能损坏一层建筑。",
    "tone": "bad",
    "choices": [
      {
        "id": "lake_cable_alarm_reinforce",
        "label": "支付临时加固费",
        "description": "支付 700 PM$，避免建筑损坏。",
        "cash": -700
      },
      {
        "id": "lake_cable_alarm_assist",
        "label": "协助布置隔离带",
        "description": "体力 -10、心情 -6，避免建筑损坏。",
        "stamina": -10,
        "mood": -6
      },
      {
        "id": "lake_cable_alarm_defer",
        "label": "延后检修",
        "description": "随机一处自己的 1～3 层普通建筑降低 1 层；没有符合条件的建筑则无损失，地标不受影响。",
        "damageBuilding": true
      }
    ]
  },
  {
    "id": "lake_prism_alignment",
    "mapId": "lake",
    "rarity": "rare",
    "dlc": true,
    "title": "镜湖双月合相",
    "story": "双月在镜湖倒影中短暂重合，岸边的旧观测仪显露出一枚折光星核。天文台愿意购买观测影像，也允许你承担封装费用，将星核制成罕见的百面骰。",
    "tone": "choice",
    "choices": [
      {
        "id": "lake_prism_alignment_core",
        "label": "封装折光星核",
        "description": "支付 2400 PM$，获得 1 个百面星核骰。",
        "cash": -2400,
        "item": "dice100"
      },
      {
        "id": "lake_prism_alignment_images",
        "label": "向天文台传图",
        "description": "获得 1400 PM$，心情 +12。",
        "cash": 1400,
        "mood": 12
      }
    ]
  },
  {
    "id": "lake_civic_charter",
    "mapId": "lake",
    "rarity": "rare",
    "dlc": true,
    "title": "湖城旧约公示",
    "story": "湖城公开一批早期地籍档案，部分收购条款仍然有效。档案馆邀请你补齐手续领取契约，或协助守护原件，换取商会准备的防护凭证。",
    "tone": "choice",
    "choices": [
      {
        "id": "lake_civic_charter_charter",
        "label": "补齐地籍档案",
        "description": "支付 1800 PM$，获得 1 张强制收购契约；实际收购仍须按道具规则另行支付地价。",
        "cash": -1800,
        "item": "acquire"
      },
      {
        "id": "lake_civic_charter_guard",
        "label": "志愿守护档案",
        "description": "心情 -10，获得 1 张星盾卡。",
        "mood": -10,
        "item": "shield"
      },
      {
        "id": "lake_civic_charter_publish",
        "label": "整理公开版本",
        "description": "获得 600 PM$。",
        "cash": 600
      }
    ]
  },
  {
    "id": "coast_tide_parcel",
    "mapId": "coast",
    "rarity": "common",
    "dlc": true,
    "title": "潮线漂来的邮包",
    "story": "晨潮湾退潮时，一只防水邮包搁在路旁的潮线边。收件人就在附近码头，你的代理人归还邮包后，可以选择现金谢礼或随行补给。",
    "tone": "good",
    "choices": [
      {
        "id": "coast_tide_parcel_cash",
        "label": "领取送还谢礼",
        "description": "获得 360 PM$。",
        "cash": 360
      },
      {
        "id": "coast_tide_parcel_supply",
        "label": "接受补给答谢",
        "description": "获得 1 份能量小食，心情 +4。",
        "item": "snack",
        "mood": 4
      }
    ]
  },
  {
    "id": "coast_salt_spray",
    "mapId": "coast",
    "rarity": "common",
    "dlc": true,
    "title": "盐雾侵入信标",
    "story": "暮帆湾的盐雾渗进了信标外壳，外侧接触片开始失灵。修理摊有现成的密封圈，也能借工具给你的代理人手动清理。",
    "tone": "bad",
    "choices": [
      {
        "id": "coast_salt_spray_seal",
        "label": "更换密封圈",
        "description": "支付 260 PM$。",
        "cash": -260
      },
      {
        "id": "coast_salt_spray_clean",
        "label": "手动清理触点",
        "description": "体力 -5、心情 -3。",
        "stamina": -5,
        "mood": -3
      }
    ]
  },
  {
    "id": "coast_color_fair",
    "mapId": "coast",
    "rarity": "common",
    "dlc": true,
    "title": "珊瑚颜料集市",
    "story": "珊瑚区的摊主用当地矿砂调制海岸颜料，今天正在举办试印集市。代理人可以帮忙搬运色砂赚取报酬，也可以亲手印一张双湾明信片。",
    "tone": "choice",
    "choices": [
      {
        "id": "coast_color_fair_carry",
        "label": "搬运色砂",
        "description": "体力 -4，获得 420 PM$。",
        "stamina": -4,
        "cash": 420
      },
      {
        "id": "coast_color_fair_print",
        "label": "试印海岸明信片",
        "description": "心情 +12。",
        "mood": 12
      }
    ]
  },
  {
    "id": "coast_twin_bay_ferry",
    "mapId": "coast",
    "rarity": "common",
    "dlc": true,
    "title": "双湾摆渡临班",
    "story": "连接两片矩形海湾的摆渡船临时增开了一班，码头正在重新安排装载顺序。船员请求协助整理栈板，或提供信标记录里的客流信息。",
    "tone": "choice",
    "choices": [
      {
        "id": "coast_twin_bay_ferry_planks",
        "label": "整理登船栈板",
        "description": "体力 -4，获得 1 个八面电子骰。",
        "stamina": -4,
        "item": "dice8"
      },
      {
        "id": "coast_twin_bay_ferry_schedule",
        "label": "提供排班记录",
        "description": "获得 180 PM$。",
        "cash": 180
      }
    ]
  },
  {
    "id": "coast_shell_beacon",
    "mapId": "coast",
    "rarity": "common",
    "dlc": true,
    "title": "海镜贝壳路标",
    "story": "海镜步道的贝壳路标被浪花冲乱了方向。步道管理员请经过的代理人校正坐标；旁边的留言墙也正征集旅人的海风寄语。",
    "tone": "good",
    "choices": [
      {
        "id": "coast_shell_beacon_coords",
        "label": "修正路标坐标",
        "description": "获得 260 PM$，心情 +6。",
        "cash": 260,
        "mood": 6
      },
      {
        "id": "coast_shell_beacon_message",
        "label": "留下海风留言",
        "description": "心情 +14。",
        "mood": 14
      }
    ]
  },
  {
    "id": "coast_tidal_window",
    "mapId": "coast",
    "rarity": "uncommon",
    "dlc": true,
    "title": "潮窗通航许可",
    "story": "双湾交汇处只在特定潮位开放补给航道，港务站正核对当天的潮窗。协助校准海图可换取换乘凭证，连续记录潮位则可领取一笔测量费。",
    "tone": "choice",
    "choices": [
      {
        "id": "coast_tidal_window_chart",
        "label": "协助海图校准",
        "description": "支付 360 PM$，获得 1 张星轨换乘券；使用后才会移动。",
        "cash": -360,
        "item": "teleport"
      },
      {
        "id": "coast_tidal_window_gauge",
        "label": "连续记录潮位",
        "description": "体力 -6，获得 700 PM$。",
        "stamina": -6,
        "cash": 700
      },
      {
        "id": "coast_tidal_window_report",
        "label": "提供现有航线记录",
        "description": "获得 240 PM$。",
        "cash": 240
      }
    ]
  },
  {
    "id": "coast_customs_seal",
    "mapId": "coast",
    "rarity": "uncommon",
    "dlc": true,
    "title": "暮帆错盖的封签",
    "story": "暮帆货栈误把待核验封签贴在你的补给箱上。港务员要求补办单证或当场逐箱核验；若延后处理，代理人将暂时进入拘留流程等待复核。",
    "tone": "bad",
    "choices": [
      {
        "id": "coast_customs_seal_papers",
        "label": "补办通行单证",
        "description": "支付 650 PM$。",
        "cash": -650
      },
      {
        "id": "coast_customs_seal_inspect",
        "label": "配合逐箱核验",
        "description": "心情 -10。",
        "mood": -10
      },
      {
        "id": "coast_customs_seal_review",
        "label": "留待港务复核",
        "description": "进入监狱，禁锢 3 次行动，期间不能收租；有效免捕卡可按现行规则抵消。",
        "confinement": "prison"
      }
    ]
  },
  {
    "id": "coast_rescue_gear",
    "mapId": "coast",
    "rarity": "uncommon",
    "dlc": true,
    "title": "退役救生舱拆解",
    "story": "双湾救援站正在拆解一只退役救生舱，里面的折叠收纳结构仍然完好。你可以资助拆解换取背包，或让代理人拆下一块能挡雨的轻质舱板。",
    "tone": "choice",
    "choices": [
      {
        "id": "coast_rescue_gear_fund",
        "label": "资助拆解",
        "description": "支付 650 PM$，获得 1 个折叠背包；使用后容量 +4。",
        "cash": -650,
        "item": "bag"
      },
      {
        "id": "coast_rescue_gear_panel",
        "label": "拆下完好遮雨板",
        "description": "体力 -8，获得 1 把三日星伞。",
        "stamina": -8,
        "item": "umbrella"
      },
      {
        "id": "coast_rescue_gear_recycle",
        "label": "代收回收金属",
        "description": "获得 300 PM$。",
        "cash": 300
      }
    ]
  },
  {
    "id": "coast_lighthouse_core",
    "mapId": "coast",
    "rarity": "rare",
    "dlc": true,
    "title": "双湾灯塔的备用核心",
    "story": "两座湾口灯塔同步检修时，技师发现了一枚封存的局地气象核心。核心可以改装为天气控制器；若你愿意协助人工校准，灯塔也能直接支付报酬。",
    "tone": "choice",
    "choices": [
      {
        "id": "coast_lighthouse_core_core",
        "label": "资助核心封装",
        "description": "支付 1600 PM$，获得 1 个天气控制器；使用后才会改变下一次天气。",
        "cash": -1600,
        "item": "weather"
      },
      {
        "id": "coast_lighthouse_core_calibrate",
        "label": "完成手动校准",
        "description": "体力 -12，获得 1500 PM$。",
        "stamina": -12,
        "cash": 1500
      },
      {
        "id": "coast_lighthouse_core_archive",
        "label": "拍摄灯塔档案",
        "description": "心情 +18。",
        "mood": 18
      }
    ]
  },
  {
    "id": "coast_ship_manifest",
    "mapId": "coast",
    "rarity": "rare",
    "dlc": true,
    "title": "百年前的无主舱单",
    "story": "退潮露出的旧航标底座里藏着一份无主舱单，记录了一枚沉船星核的合法归属。海事馆确认可以登记修复，也愿意收购这条完整的历史线索。",
    "tone": "choice",
    "choices": [
      {
        "id": "coast_ship_manifest_restore",
        "label": "登记并修复星核",
        "description": "支付 2600 PM$，获得 1 个百面星核骰。",
        "cash": -2600,
        "item": "dice100"
      },
      {
        "id": "coast_ship_manifest_museum",
        "label": "向海事馆转交线索",
        "description": "获得 1600 PM$。",
        "cash": 1600
      }
    ]
  },
  {
    "id": "valley_pine_rest",
    "mapId": "valley",
    "rarity": "common",
    "dlc": true,
    "title": "松脊补给亭",
    "story": "松脊林道旁的护林补给亭刚煮好一锅热汤。护林员请经过的代理人稍作休整，也可以把一份月露茶带上继续赶路。",
    "tone": "good",
    "choices": [
      {
        "id": "valley_pine_rest_soup",
        "label": "喝一碗热汤",
        "description": "体力 +14。",
        "stamina": 14
      },
      {
        "id": "valley_pine_rest_tea",
        "label": "领取随行茶包",
        "description": "获得 1 份月露茶。",
        "item": "tea"
      }
    ]
  },
  {
    "id": "valley_echo_delivery",
    "mapId": "valley",
    "rarity": "common",
    "dlc": true,
    "title": "回声山邮",
    "story": "云岚与月麓之间的山邮站正在传递一封急信，收件人就在下一片居民区。代理人可以帮忙捎信领取报酬，也能使用回声台先通知对方。",
    "tone": "choice",
    "choices": [
      {
        "id": "valley_echo_delivery_deliver",
        "label": "沿途代送山邮",
        "description": "体力 -4，获得 380 PM$。",
        "stamina": -4,
        "cash": 380
      },
      {
        "id": "valley_echo_delivery_echo",
        "label": "用回声台通知收件人",
        "description": "心情 +8。",
        "mood": 8
      }
    ]
  },
  {
    "id": "valley_resin_boot",
    "mapId": "valley",
    "rarity": "common",
    "dlc": true,
    "title": "云岚树脂粘靴",
    "story": "云岚林道新落的树脂粘住了代理人的鞋底，走起路来格外费力。林边修鞋匠可以快速清理，代理人也能用工具自行刮除。",
    "tone": "bad",
    "choices": [
      {
        "id": "valley_resin_boot_cobbler",
        "label": "请修鞋匠清理",
        "description": "支付 220 PM$。",
        "cash": -220
      },
      {
        "id": "valley_resin_boot_scrape",
        "label": "自行刮除树脂",
        "description": "体力 -5。",
        "stamina": -5
      }
    ]
  },
  {
    "id": "valley_bridge_detour",
    "mapId": "valley",
    "rarity": "common",
    "dlc": true,
    "title": "月麓吊桥检修",
    "story": "月麓吊桥正在更换承重索，路边开辟了两条临时通行小道。维护平整的便道要分担养护费，林间小径则会多耗一些体力。",
    "tone": "bad",
    "choices": [
      {
        "id": "valley_bridge_detour_path",
        "label": "支付便道养护费",
        "description": "支付 300 PM$；事件不额外改变棋盘位置。",
        "cash": -300
      },
      {
        "id": "valley_bridge_detour_forest",
        "label": "从林间绕行",
        "description": "体力 -6、心情 -2；事件不额外改变棋盘位置。",
        "stamina": -6,
        "mood": -2
      }
    ]
  },
  {
    "id": "valley_herb_note",
    "mapId": "valley",
    "rarity": "common",
    "dlc": true,
    "title": "晶谷识草手册",
    "story": "晶谷植物站想把容易认错的药草整理成一本图册。代理人的路途记录恰好能补上缺页，植物站愿意支付校勘费，或开放试验园供你休息。",
    "tone": "good",
    "choices": [
      {
        "id": "valley_herb_note_notes",
        "label": "校勘识草手册",
        "description": "获得 300 PM$。",
        "cash": 300
      },
      {
        "id": "valley_herb_note_garden",
        "label": "参观药草试验园",
        "description": "心情 +10、体力 +5。",
        "mood": 10,
        "stamina": 5
      }
    ]
  },
  {
    "id": "valley_seed_bank",
    "mapId": "valley",
    "rarity": "uncommon",
    "dlc": true,
    "title": "断电的种子库",
    "story": "山谷种子库的备用温控器失灵，护林员正抢运珍贵的本地种子。你可以资助零件换取生态站的幸运星签，也可以出力搬运，或帮忙联络备用电源。",
    "tone": "choice",
    "choices": [
      {
        "id": "valley_seed_bank_parts",
        "label": "支付温控零件费",
        "description": "支付 500 PM$，获得 1 张幸运星签。",
        "cash": -500,
        "item": "luck"
      },
      {
        "id": "valley_seed_bank_carry",
        "label": "搬运保温箱",
        "description": "体力 -8，获得 680 PM$。",
        "stamina": -8,
        "cash": 680
      },
      {
        "id": "valley_seed_bank_contact",
        "label": "联络备用电源",
        "description": "心情 +8。",
        "mood": 8
      }
    ]
  },
  {
    "id": "valley_rockfall_monitor",
    "mapId": "valley",
    "rarity": "uncommon",
    "dlc": true,
    "title": "松脊落石预警",
    "story": "松脊监测柱发现上方坡面有碎石松动，养护队临时拦住了通路。你可以分担支护费用、协助清理，或让代理人在安全停车区等待放行。",
    "tone": "bad",
    "choices": [
      {
        "id": "valley_rockfall_monitor_shore",
        "label": "分担临时支护费",
        "description": "支付 750 PM$。",
        "cash": -750
      },
      {
        "id": "valley_rockfall_monitor_clear",
        "label": "协助清理碎石",
        "description": "体力 -10、心情 -5。",
        "stamina": -10,
        "mood": -5
      },
      {
        "id": "valley_rockfall_monitor_wait",
        "label": "在停车区等候放行",
        "description": "进入停车场，禁锢 3 次行动，期间仍可收租。",
        "confinement": "parking"
      }
    ]
  },
  {
    "id": "valley_cable_workshop",
    "mapId": "valley",
    "rarity": "uncommon",
    "dlc": true,
    "title": "云岚索道工坊",
    "story": "云岚索道工坊正在检修跨谷运输车，缺一批轴承和维护工具。工匠愿意用校准骰或建筑修复包答谢，也会购买沿线的运行记录。",
    "tone": "choice",
    "choices": [
      {
        "id": "valley_cable_workshop_bearing",
        "label": "送回备用轴承",
        "description": "体力 -8，获得 1 个十二面电子骰。",
        "stamina": -8,
        "item": "dice12"
      },
      {
        "id": "valley_cable_workshop_tools",
        "label": "资助检修工具",
        "description": "支付 600 PM$，获得 1 个建筑修复包。",
        "cash": -600,
        "item": "repair"
      },
      {
        "id": "valley_cable_workshop_data",
        "label": "提供沿线运行参数",
        "description": "获得 260 PM$。",
        "cash": 260
      }
    ]
  },
  {
    "id": "valley_resonance_cave",
    "mapId": "valley",
    "rarity": "rare",
    "dlc": true,
    "title": "晶谷共鸣洞窟",
    "story": "晶谷深处新开放的勘探点里，晶簇会随着脚步发出规律的共鸣。研究站找到了一枚可制成百面骰的星核，也在征集洞窟声纹用于保护性测绘。",
    "tone": "choice",
    "choices": [
      {
        "id": "valley_resonance_cave_core",
        "label": "购买许可并封装星核",
        "description": "支付 2200 PM$，获得 1 个百面星核骰。",
        "cash": -2200,
        "item": "dice100"
      },
      {
        "id": "valley_resonance_cave_sound",
        "label": "记录洞窟声纹",
        "description": "体力 -8，获得 1400 PM$。",
        "stamina": -8,
        "cash": 1400
      },
      {
        "id": "valley_resonance_cave_listen",
        "label": "在洞口聆听回声",
        "description": "心情 +20。",
        "mood": 20
      }
    ]
  },
  {
    "id": "valley_canopy_vault",
    "mapId": "valley",
    "rarity": "rare",
    "dlc": true,
    "title": "古树冠层气象匣",
    "story": "月麓古树的观测平台上，生态站发现了一只封存多年的气象匣。修复取件飞行器便能回收其中的控制装置；协助值守或归还匣体也会得到答谢。",
    "tone": "choice",
    "choices": [
      {
        "id": "valley_canopy_vault_drone",
        "label": "修复取件飞行器",
        "description": "支付 1300 PM$，获得 1 个天气控制器；使用后才会改变下一次天气。",
        "cash": -1300,
        "item": "weather"
      },
      {
        "id": "valley_canopy_vault_watch",
        "label": "替生态站值守",
        "description": "心情 -12，获得 1 张星盾卡。",
        "mood": -12,
        "item": "shield"
      },
      {
        "id": "valley_canopy_vault_case",
        "label": "归还气象匣体",
        "description": "获得 900 PM$，体力 +8。",
        "cash": 900,
        "stamina": 8
      }
    ]
  }
];
