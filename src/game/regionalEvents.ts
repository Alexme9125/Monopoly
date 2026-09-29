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
  },
  {
    "id": "sundered_last_lamp",
    "mapId": "sundered",
    "rarity": "common",
    "dlc": true,
    "title": "末灯旧屋的炉火",
    "story": "林线下最后一间亮着灯的小屋还留有一张护林员的便条：添过柴的人，可以取一份热饮。你的代理人整理好炉边，终于能坐下来歇口气。",
    "tone": "good",
    "choices": [
      {
        "id": "sundered_last_lamp_rest",
        "label": "在炉边休息",
        "description": "体力 +8、心情 +12。",
        "stamina": 8,
        "mood": 12
      },
      {
        "id": "sundered_last_lamp_tea",
        "label": "带走随行热饮",
        "description": "获得 1 份月露茶。",
        "item": "tea"
      }
    ]
  },
  {
    "id": "sundered_rosehip_trail",
    "mapId": "sundered",
    "rarity": "common",
    "dlc": true,
    "title": "白桦旁的玫瑰果",
    "story": "末灯林地的旧路标旁长着一丛玫瑰果，巡林站正在为山上木屋补充食品。代理人可以帮忙采集领取报酬，也能领取一份已经封好的路餐。",
    "tone": "good",
    "choices": [
      {
        "id": "sundered_rosehip_trail_pick",
        "label": "协助采集玫瑰果",
        "description": "体力 -2，获得 260 PM$。",
        "stamina": -2,
        "cash": 260
      },
      {
        "id": "sundered_rosehip_trail_ration",
        "label": "领取巡林路餐",
        "description": "获得 1 份能量小食。",
        "item": "snack"
      }
    ]
  },
  {
    "id": "sundered_angler_lake",
    "mapId": "sundered",
    "rarity": "common",
    "dlc": true,
    "title": "漫行湖的鱼讯",
    "story": "高原湖边只有一座小小的钓鱼棚。管理员想把鱼群记录送到山下，你可以让代理人帮忙整理渔获换一份热食，或代传记录领取跑腿费。",
    "tone": "choice",
    "choices": [
      {
        "id": "sundered_angler_lake_catch",
        "label": "协助整理渔获",
        "description": "体力 -5，获得 1 份星港盛宴。",
        "stamina": -5,
        "item": "feast"
      },
      {
        "id": "sundered_angler_lake_record",
        "label": "转交鱼群记录",
        "description": "获得 180 PM$。",
        "cash": 180
      }
    ]
  },
  {
    "id": "sundered_refuge_roof",
    "mapId": "sundered",
    "rarity": "common",
    "dlc": true,
    "title": "避难木屋的旧屋顶",
    "story": "你为代理人预留的山道木屋被落枝砸松了屋顶，管理员正在检查漏风处。可以分担维修材料费，也可以让代理人亲手固定棚板。",
    "tone": "bad",
    "choices": [
      {
        "id": "sundered_refuge_roof_materials",
        "label": "支付补缝材料费",
        "description": "支付 280 PM$。",
        "cash": -280
      },
      {
        "id": "sundered_refuge_roof_secure",
        "label": "固定松动棚板",
        "description": "体力 -5、心情 -2。",
        "stamina": -5,
        "mood": -2
      }
    ]
  },
  {
    "id": "sundered_reluctant_shortcut",
    "mapId": "sundered",
    "rarity": "common",
    "dlc": true,
    "title": "不太情愿的近路",
    "story": "一块褪色指路牌把代理人引向废弃矿道，所谓近路只剩下成堆碎石。向养护队借搬运车需要付费，自己挪开路障则更耗体力。",
    "tone": "bad",
    "choices": [
      {
        "id": "sundered_reluctant_shortcut_cart",
        "label": "租用碎石搬运车",
        "description": "支付 320 PM$。",
        "cash": -320
      },
      {
        "id": "sundered_reluctant_shortcut_clear",
        "label": "自行清理路障",
        "description": "体力 -6。",
        "stamina": -6
      }
    ]
  },
  {
    "id": "sundered_wolf_tracks",
    "mapId": "sundered",
    "rarity": "uncommon",
    "dlc": true,
    "title": "雪线下的狼影",
    "story": "巡林员在回声裂谷的两端发现了灰脊狼群的足迹，暂时拦住了代理人的补给车。可以购买护送服务、耐心配合警戒，或把车留在安全停车区等候。",
    "tone": "bad",
    "choices": [
      {
        "id": "sundered_wolf_tracks_escort",
        "label": "购买巡林护送服务",
        "description": "支付 650 PM$。",
        "cash": -650
      },
      {
        "id": "sundered_wolf_tracks_watch",
        "label": "配合巡林警戒",
        "description": "心情 -10。",
        "mood": -10
      },
      {
        "id": "sundered_wolf_tracks_park",
        "label": "留在安全停车区",
        "description": "进入停车场，禁锢 3 次行动，期间仍可收租。",
        "confinement": "parking"
      }
    ]
  },
  {
    "id": "sundered_shortwave",
    "mapId": "sundered",
    "rarity": "uncommon",
    "dlc": true,
    "title": "极光里的短波",
    "story": "气象员带来上一次极光期间录下的短波信号，其中夹杂着重复的信标校准指令。你可以资助解码换取控骰器，也能协助整理录音，或把线索转交巡林站。",
    "tone": "choice",
    "choices": [
      {
        "id": "sundered_shortwave_decode",
        "label": "资助信号解码",
        "description": "支付 600 PM$，获得 1 个控骰器。",
        "cash": -600,
        "item": "controller"
      },
      {
        "id": "sundered_shortwave_sort",
        "label": "整理整夜录音",
        "description": "体力 -8，获得 700 PM$。",
        "stamina": -8,
        "cash": 700
      },
      {
        "id": "sundered_shortwave_forward",
        "label": "转交信号线索",
        "description": "心情 +8。",
        "mood": 8
      }
    ]
  },
  {
    "id": "sundered_buried_settlement",
    "mapId": "sundered",
    "rarity": "uncommon",
    "dlc": true,
    "title": "半埋的旧聚落",
    "story": "高原旧聚落留下了被碎石半埋的木屋和一份完好的物资清单。修缮队征集材料资金与搬运人手，愿以修复工具或露营补给答谢；完整记录也有保存价值。",
    "tone": "choice",
    "choices": [
      {
        "id": "sundered_buried_settlement_fund",
        "label": "资助清点与修缮",
        "description": "支付 550 PM$，获得 1 个建筑修复包。",
        "cash": -550,
        "item": "repair"
      },
      {
        "id": "sundered_buried_settlement_carry",
        "label": "搬出封存补给箱",
        "description": "体力 -8，获得 1 份野营休憩包。",
        "stamina": -8,
        "item": "restkit"
      },
      {
        "id": "sundered_buried_settlement_archive",
        "label": "转交聚落清单",
        "description": "获得 240 PM$。",
        "cash": 240
      }
    ]
  },
  {
    "id": "sundered_weather_archive",
    "mapId": "sundered",
    "rarity": "rare",
    "dlc": true,
    "title": "第二岩柱的观测档案",
    "story": "望穹气象站建在高高的岩柱上，断桥另一端保存着多年的风雪观测。站内工程师找到了可回收的局地气象模块，你可以承担修复费用，也可以把档案整理给研究机构。",
    "tone": "choice",
    "choices": [
      {
        "id": "sundered_weather_archive_restore",
        "label": "修复局地气象模块",
        "description": "支付 1700 PM$，获得 1 个天气控制器；使用后才会改变下一次天气。",
        "cash": -1700,
        "item": "weather"
      },
      {
        "id": "sundered_weather_archive_records",
        "label": "整理风雪观测档案",
        "description": "获得 1100 PM$，心情 +10。",
        "cash": 1100,
        "mood": 10
      }
    ]
  },
  {
    "id": "sundered_last_horizon",
    "mapId": "sundered",
    "rarity": "rare",
    "dlc": true,
    "title": "最后一线地平",
    "story": "代理人沿着旧登山者留下的坐标，在高脊观测匣里找到一枚映着地平线的星核。它可以封装成百面骰；天文协会也愿意购买这段远行记录，替那些没有署名的人留下痕迹。",
    "tone": "choice",
    "choices": [
      {
        "id": "sundered_last_horizon_core",
        "label": "封装地平星核",
        "description": "支付 2400 PM$，获得 1 个百面星核骰。",
        "cash": -2400,
        "item": "dice100"
      },
      {
        "id": "sundered_last_horizon_journal",
        "label": "转交远行记录",
        "description": "获得 1300 PM$，心情 +12。",
        "cash": 1300,
        "mood": 12
      }
    ]
  },
  {
    "id": "forest_seed_courier",
    "mapId": "forest",
    "rarity": "common",
    "dlc": true,
    "title": "初芽种子邮袋",
    "story": "林间苗圃只用步行邮袋运送种子，避免运输机惊动正在筑巢的鸟群。园丁请你的代理人把最后一袋送到环路另一侧。",
    "tone": "good",
    "choices": [
      {
        "id": "forest_seed_courier_carry",
        "label": "送达种子邮袋",
        "description": "体力 -3，获得 420 PM$。",
        "stamina": -3,
        "cash": 420
      },
      {
        "id": "forest_seed_courier_sort",
        "label": "帮忙核对标签",
        "description": "获得 180 PM$。",
        "cash": 180
      }
    ]
  },
  {
    "id": "forest_fern_tea",
    "mapId": "forest",
    "rarity": "common",
    "dlc": true,
    "title": "蕨溪茶席",
    "story": "蕨溪的净水师在树荫下支起茶席。今天的水温恰好适合冲泡月露茶，经过的代理人都能歇一会儿。",
    "tone": "good",
    "choices": [
      {
        "id": "forest_fern_tea_rest",
        "label": "坐下听溪水",
        "description": "心情 +14。",
        "mood": 14
      },
      {
        "id": "forest_fern_tea_tea",
        "label": "带一杯路上喝",
        "description": "获得 1 份月露茶。",
        "item": "tea"
      }
    ]
  },
  {
    "id": "forest_pollen_filter",
    "mapId": "forest",
    "rarity": "common",
    "dlc": true,
    "title": "树冠花粉季",
    "story": "树冠上的花粉堵住了信标的进气滤网。维护员带来了备用滤芯，代理人也可以自己慢慢清理。",
    "tone": "bad",
    "choices": [
      {
        "id": "forest_pollen_filter_replace",
        "label": "更换滤芯",
        "description": "支付 280 PM$。",
        "cash": -280
      },
      {
        "id": "forest_pollen_filter_clean",
        "label": "自己清理滤网",
        "description": "体力 -4、心情 -3。",
        "stamina": -4,
        "mood": -3
      }
    ]
  },
  {
    "id": "forest_root_marker",
    "mapId": "forest",
    "rarity": "common",
    "dlc": true,
    "title": "树根旁的界桩",
    "story": "一条生长缓慢的老树根抵住了测绘界桩。土地事务员需要重新登记保护退界，你可以交服务费，也可以协助测量。",
    "tone": "choice",
    "choices": [
      {
        "id": "forest_root_marker_pay",
        "label": "委托重新测绘",
        "description": "支付 350 PM$。",
        "cash": -350
      },
      {
        "id": "forest_root_marker_survey",
        "label": "协助标记退界",
        "description": "体力 -5。",
        "stamina": -5
      }
    ]
  },
  {
    "id": "forest_dawn_bird",
    "mapId": "forest",
    "rarity": "common",
    "dlc": true,
    "title": "林冠晨鸣",
    "story": "鸟类观察员正在整理晨鸣记录，缺少一份环路东段的数据。代理人可以留下录音，也可以安静地听到这段合唱结束。",
    "tone": "good",
    "choices": [
      {
        "id": "forest_dawn_bird_record",
        "label": "提交晨鸣录音",
        "description": "获得 360 PM$。",
        "cash": 360
      },
      {
        "id": "forest_dawn_bird_listen",
        "label": "听完林间合唱",
        "description": "心情 +12。",
        "mood": 12
      }
    ]
  },
  {
    "id": "forest_twin_nursery",
    "mapId": "forest",
    "rarity": "uncommon",
    "dlc": true,
    "title": "双芽育苗室",
    "story": "冠庭育苗室发现两株同步舒展的晶芽。研究员愿意交出一份双生样本，但需要有人承担培养材料费和照料工作。",
    "tone": "choice",
    "choices": [
      {
        "id": "forest_twin_nursery_adopt",
        "label": "接管双生样本",
        "description": "支付 480 PM$、心情 -5，获得双生培养皿。",
        "cash": -480,
        "mood": -5,
        "item": "twinDish"
      },
      {
        "id": "forest_twin_nursery_observe",
        "label": "短暂参观",
        "description": "体力 +8、心情 +8。",
        "stamina": 8,
        "mood": 8
      }
    ]
  },
  {
    "id": "forest_canopy_lease",
    "mapId": "forest",
    "rarity": "uncommon",
    "dlc": true,
    "title": "林冠协作凭证",
    "story": "高价林地上的商户组成了共享接待计划。赞助公共步道后，可以领取一张用于下一次过夜结算的免租卡。",
    "tone": "choice",
    "choices": [
      {
        "id": "forest_canopy_lease_sponsor",
        "label": "赞助公共步道",
        "description": "支付 700 PM$，获得 1 张免租卡。",
        "cash": -700,
        "item": "rent"
      },
      {
        "id": "forest_canopy_lease_volunteer",
        "label": "整理步道记录",
        "description": "体力 -3，获得 300 PM$。",
        "stamina": -3,
        "cash": 300
      }
    ]
  },
  {
    "id": "forest_ranger_pack",
    "mapId": "forest",
    "rarity": "uncommon",
    "dlc": true,
    "title": "巡林员的折叠包",
    "story": "巡林员正在改装能穿过密林的折叠背包。你若协助试背并补齐材料费，就能带走这件成品。",
    "tone": "choice",
    "choices": [
      {
        "id": "forest_ranger_pack_test",
        "label": "参加负重试背",
        "description": "支付 800 PM$、体力 -6，获得折叠背包。",
        "cash": -800,
        "stamina": -6,
        "item": "bag"
      },
      {
        "id": "forest_ranger_pack_rest",
        "label": "在巡林站休息",
        "description": "心情 +10。",
        "mood": 10
      }
    ]
  },
  {
    "id": "forest_root_relay",
    "mapId": "forest",
    "rarity": "rare",
    "dlc": true,
    "title": "古根中的相位晶体",
    "story": "始初之树的倒伏古根露出一颗相位晶体。测绘队希望把它用于无损勘察，愿把校准后的传送石交给承担费用的协作者。",
    "tone": "choice",
    "choices": [
      {
        "id": "forest_root_relay_calibrate",
        "label": "协助无损校准",
        "description": "支付 1800 PM$、体力 -10，获得传送石。",
        "cash": -1800,
        "stamina": -10,
        "item": "teleportStone"
      },
      {
        "id": "forest_root_relay_document",
        "label": "绘制古根记录",
        "description": "获得 1000 PM$。",
        "cash": 1000
      }
    ]
  },
  {
    "id": "forest_century_rings",
    "mapId": "forest",
    "rarity": "rare",
    "dlc": true,
    "title": "百轮年轮档案",
    "story": "古木档案馆发现一份记录百次星轨回归的年轮拓片。研究员用它校准了百面星核骰，邀请你承担最后一段枯燥的复核工作。",
    "tone": "choice",
    "choices": [
      {
        "id": "forest_century_rings_proof",
        "label": "资助并复核拓片",
        "description": "支付 2600 PM$、心情 -8，获得百面星核骰。",
        "cash": -2600,
        "mood": -8,
        "item": "dice100"
      },
      {
        "id": "forest_century_rings_share",
        "label": "整理公开摘要",
        "description": "获得持续 3 日的幸运状态。",
        "status": "luck:3"
      }
    ]
  },
  {
    "id": "sands_water_cart",
    "mapId": "starSands",
    "rarity": "common",
    "dlc": true,
    "title": "灼湾补水车",
    "story": "补水车停进遮阳棚，司机正在为穿越荒滩的代理人分发饮水。购买一份冷却补给可以更快恢复体力，也可等免费饮水点开放。",
    "tone": "choice",
    "choices": [
      {
        "id": "sands_water_cart_buy",
        "label": "买冷却补给",
        "description": "支付 120 PM$，体力 +16。",
        "cash": -120,
        "stamina": 16
      },
      {
        "id": "sands_water_cart_wait",
        "label": "在棚下等候",
        "description": "体力 +4。",
        "stamina": 4
      }
    ]
  },
  {
    "id": "sands_sand_filter",
    "mapId": "starSands",
    "rarity": "common",
    "dlc": true,
    "title": "砂粒钻进风扇",
    "story": "横穿连接道时，细砂钻进了信标的散热风扇。维修摊报价并不高，不过耐心拆洗也能解决。",
    "tone": "bad",
    "choices": [
      {
        "id": "sands_sand_filter_repair",
        "label": "请维修摊清砂",
        "description": "支付 260 PM$。",
        "cash": -260
      },
      {
        "id": "sands_sand_filter_clean",
        "label": "自行拆洗风扇",
        "description": "体力 -5。",
        "stamina": -5
      }
    ]
  },
  {
    "id": "sands_glitter_survey",
    "mapId": "starSands",
    "rarity": "common",
    "dlc": true,
    "title": "星砾采样袋",
    "story": "荒滩上闪光的砂粒大多是普通矿屑。地质员请代理人协助分袋，避免游客把它们都当成陨星碎片带走。",
    "tone": "good",
    "choices": [
      {
        "id": "sands_glitter_survey_sort",
        "label": "分类矿屑样本",
        "description": "体力 -4，获得 420 PM$。",
        "stamina": -4,
        "cash": 420
      },
      {
        "id": "sands_glitter_survey_mark",
        "label": "标记采样位置",
        "description": "获得 180 PM$。",
        "cash": 180
      }
    ]
  },
  {
    "id": "sands_false_shore",
    "mapId": "starSands",
    "rarity": "common",
    "dlc": true,
    "title": "热浪里的假海岸",
    "story": "午后的热浪让远处盐壳像水面一样晃动。代理人误走了一段勘察便道，向导可以提供快速纠偏的路线记录。",
    "tone": "bad",
    "choices": [
      {
        "id": "sands_false_shore_guide",
        "label": "购买向导记录",
        "description": "支付 200 PM$。",
        "cash": -200
      },
      {
        "id": "sands_false_shore_retrace",
        "label": "自己核对来路",
        "description": "心情 -6。",
        "mood": -6
      }
    ]
  },
  {
    "id": "sands_night_awning",
    "mapId": "starSands",
    "rarity": "common",
    "dlc": true,
    "title": "盐汀晚风棚",
    "story": "日落后，盐汀的遮阳棚变成了小小的休息站。摊主请代理人坐一会儿，也准备了方便携带的补给。",
    "tone": "good",
    "choices": [
      {
        "id": "sands_night_awning_sit",
        "label": "坐下等晚风",
        "description": "心情 +12。",
        "mood": 12
      },
      {
        "id": "sands_night_awning_snack",
        "label": "带走补给",
        "description": "获得 1 份能量小食。",
        "item": "snack"
      }
    ]
  },
  {
    "id": "sands_sail_shield",
    "mapId": "starSands",
    "rarity": "uncommon",
    "dlc": true,
    "title": "抗砂遮风帆",
    "story": "帆具师把报废的防护薄膜改成便携星盾。你可以替她测试固定扣并支付材料费，或先帮忙整理工具。",
    "tone": "choice",
    "choices": [
      {
        "id": "sands_sail_shield_test",
        "label": "测试防护薄膜",
        "description": "支付 600 PM$、体力 -4，获得 1 张星盾卡。",
        "cash": -600,
        "stamina": -4,
        "item": "shield"
      },
      {
        "id": "sands_sail_shield_tidy",
        "label": "整理帆具工具",
        "description": "心情 +6。",
        "mood": 6
      }
    ]
  },
  {
    "id": "sands_drying_rack",
    "mapId": "starSands",
    "rarity": "uncommon",
    "dlc": true,
    "title": "风蚀晾晒架",
    "story": "连接道边的补给队正在收集高效干燥颗粒。购买密封剂能处理背包里的潮气，搬运晾晒架则能挣一笔工钱。",
    "tone": "choice",
    "choices": [
      {
        "id": "sands_drying_rack_buy",
        "label": "买一罐密封干燥剂",
        "description": "支付 260 PM$，获得全效干燥剂。",
        "cash": -260,
        "item": "dry"
      },
      {
        "id": "sands_drying_rack_carry",
        "label": "帮忙搬运晾晒架",
        "description": "体力 -6，获得 480 PM$。",
        "stamina": -6,
        "cash": 480
      }
    ]
  },
  {
    "id": "sands_salt_calibration",
    "mapId": "starSands",
    "rarity": "uncommon",
    "dlc": true,
    "title": "盐原测距标",
    "story": "测距员用两条平行道路校验信标误差。代理人若完成一段往返测试并承担零件费，就可以拿走一台控骰器。",
    "tone": "choice",
    "choices": [
      {
        "id": "sands_salt_calibration_calibrate",
        "label": "完成往返校准",
        "description": "支付 850 PM$、体力 -5，获得控骰器。",
        "cash": -850,
        "stamina": -5,
        "item": "controller"
      },
      {
        "id": "sands_salt_calibration_record",
        "label": "整理测距日志",
        "description": "获得 400 PM$。",
        "cash": 400
      }
    ]
  },
  {
    "id": "sands_mirage_gate",
    "mapId": "starSands",
    "rarity": "rare",
    "dlc": true,
    "title": "蜃景中的中继门",
    "story": "星砂的折射让一座旧中继门时隐时现。维修队找到了尚能使用的相位石，但需要重新供能并校准坐标。",
    "tone": "choice",
    "choices": [
      {
        "id": "sands_mirage_gate_restore",
        "label": "资助中继校准",
        "description": "支付 1800 PM$、体力 -8，获得传送石。",
        "cash": -1800,
        "stamina": -8,
        "item": "teleportStone"
      },
      {
        "id": "sands_mirage_gate_map",
        "label": "提交中继门坐标",
        "description": "获得 900 PM$。",
        "cash": 900
      }
    ]
  },
  {
    "id": "sands_weather_wreck",
    "mapId": "starSands",
    "rarity": "rare",
    "dlc": true,
    "title": "埋在砂中的气象舱",
    "story": "风蚀露出了一艘旧气象舱的外壳。舱内的控制模块仍然完好，勘察队愿让出它，换取修复经费和协助。",
    "tone": "choice",
    "choices": [
      {
        "id": "sands_weather_wreck_salvage",
        "label": "修复气象模块",
        "description": "支付 1300 PM$、体力 -10，获得天气控制器。",
        "cash": -1300,
        "stamina": -10,
        "item": "weather"
      },
      {
        "id": "sands_weather_wreck_report",
        "label": "上交勘察报告",
        "description": "获得 1100 PM$。",
        "cash": 1100
      }
    ]
  }
];
