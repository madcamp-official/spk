/* ===== 이름 생성 =====
   각 생에 그 나라에서 그럴듯한 실명을 붙인다. 국가가 아니라 **문화권** 단위다 —
   오스트리아와 독일은 이름 풀이 같고 아르헨티나와 멕시코도 같다. 종교(REL)가 30개
   프로필로 198개국을 덮는 것과 같은 구조로, 문화권 풀 ~50개를 매핑한다.

   결정성: 사인(rollCause)과 같은 방식이다. 뽑기 난수(rand)가 아니라 생의 고정값을
   해시해 시드로 쓴다(솔트 "nm|"로 사인 시드와 분리). 그래서
     · 공유 링크로 복원한 생도 항상 같은 이름을 얻는다(링크 형식 무변경, 옛 링크 소급)
     · 웹·카운터 서버·봇이 같은 이름을 낸다
   대신 풀을 수정하면 기존 생의 이름이 바뀐다 — 사인 가중치 조정 때와 같은 트레이드오프.
   봇은 생성 시점 이름을 DB에 스냅샷해서 기록을 보존한다(003_names.sql).

   표기: 각 이름 조각은 {n:원문자, l:로마자}다. 원문자가 로마자와 다른 문화권은
   korea·japan·china 셋뿐이다 — UI 언어가 ko·ja·zh 중 그 문화권의 언어와 일치할 때만
   원문자를 쓰기 때문이다(러시아어·태국어 UI는 없다). 나머지는 n===l.
   어순: 로마자는 서구식 이름-성이 기본이되, 중국·베트남·크메르는 로마자도 성-이름을
   유지한다(시진핑이 Xi Jinping이듯). 형식(부칭·복성·bin·단명 등)은 문화권 플래그로 푼다.

   ⚠ 톤 가이드(§F): 전부 흔히 쓰이는 실제 이름이다. 우스꽝스러운 조합이 나올 수 있는
   생성 규칙(음절 조합 등)은 쓰지 않는다. 정치인·유명인 고유 성명 조합은 피했다.
   ⚠ 이름은 i18n 사전(TERMS)을 타지 않는다 — 번역이 아니라 표기 변환이다. */
import { strHash, mulberry32, isoCode } from "./util.js";
import type { CauseInput, LifeName, NamePart } from "./types.js";

/** rollName 입력 — 사인과 같은 고정값 집합 + 민족(문화권 세분화용).
 *  eth는 시드에 들어가지 않는다 — 풀 선택에만 쓴다. 민족은 생의 고정값이라
 *  (링크·DB에 보존됨) 결정성은 그대로 유지된다. */
export type NameInput = CauseInput & { eth?: readonly [string, number] };
export type UiLang = "ko" | "en" | "ja" | "zh" | "es" | "pt";

type Entry = string | [native: string, latin: string];
type Style =
  | "family"        /* 이름 + 성 (기본) */
  | "mononym"       /* 이름만 (몽골 등) */
  | "double_given"  /* 이름 두 개, 성 없음 (미얀마·부탄) */
  | "bin"           /* 이름 + bin/binti + 아버지 이름 (말레이) */
  | "patronym_is"   /* 이름 + 아버지이름(속격)+son/dóttir (아이슬란드) */
  | "father_given"  /* 이름 + 아버지 이름 (에티오피아·소말리아) */
  | "double_family";/* 이름 + 부성 + 모성 (히스패닉) */

interface Culture {
  /** 원문자를 쓸 UI 언어. korea→ko, japan→ja, china→zh 만 존재한다 */
  native?: "ko" | "ja" | "zh";
  /** 로마자에서도 성-이름 순서를 유지하는가 (중국·베트남·크메르) */
  romanFamilyFirst?: boolean;
  style?: Style;
  /** 여성형 성 규칙: a(-ov/-ev/-in에 a) · ska(-ski→-ska) · ova(체코식 -ová) */
  fem?: "a" | "ska" | "ova";
  m: Entry[];
  f: Entry[];
  /** 성 풀. mononym·double_given·bin·father_given 은 쓰지 않는다(아버지 이름은 m에서) */
  s?: Entry[];
}

const POOLS: Record<string, Culture> = {
korea: { native: "ko",
 m: [["민준","Minjun"],["서준","Seojun"],["도윤","Doyun"],["시우","Siwoo"],["지호","Jiho"],["준우","Junwoo"],["현우","Hyunwoo"],["지훈","Jihoon"],["우진","Woojin"],["성민","Seongmin"],["재현","Jaehyun"],["태윤","Taeyun"]],
 f: [["희서","Heeseo"],["서연","Seoyeon"],["지우","Jiwoo"],["하은","Haeun"],["수아","Sua"],["예린","Yerin"],["유나","Yuna"],["지민","Jimin"],["채원","Chaewon"],["은서","Eunseo"],["소율","Soyul"],["다은","Daeun"]],
 s: [["김","Kim"],["이","Lee"],["박","Park"],["최","Choi"],["정","Jung"],["강","Kang"],["조","Cho"],["윤","Yoon"],["장","Jang"],["임","Lim"],["한","Han"],["오","Oh"]] },
japan: { native: "ja",
 m: [["陽翔","Haruto"],["蓮","Ren"],["湊","Minato"],["大翔","Hiroto"],["悠真","Yuma"],["樹","Itsuki"],["朝陽","Asahi"],["蒼","Aoi"],["律","Ritsu"],["颯太","Sota"]],
 f: [["陽葵","Himari"],["凛","Rin"],["結菜","Yuina"],["芽依","Mei"],["紬","Tsumugi"],["莉子","Riko"],["咲良","Sakura"],["美羽","Miu"],["結愛","Yua"],["杏","An"]],
 s: [["佐藤","Sato"],["鈴木","Suzuki"],["高橋","Takahashi"],["田中","Tanaka"],["伊藤","Ito"],["渡辺","Watanabe"],["山本","Yamamoto"],["中村","Nakamura"],["小林","Kobayashi"],["加藤","Kato"]] },
china: { native: "zh", romanFamilyFirst: true,
 m: [["伟","Wei"],["强","Qiang"],["磊","Lei"],["洋","Yang"],["浩然","Haoran"],["子轩","Zixuan"],["宇航","Yuhang"],["俊杰","Junjie"],["明轩","Mingxuan"],["志远","Zhiyuan"]],
 f: [["芳","Fang"],["娜","Na"],["静","Jing"],["雪","Xue"],["婷婷","Tingting"],["欣怡","Xinyi"],["子涵","Zihan"],["雨桐","Yutong"],["诗涵","Shihan"],["梦琪","Mengqi"]],
 s: [["王","Wang"],["李","Li"],["张","Zhang"],["刘","Liu"],["陈","Chen"],["杨","Yang"],["黄","Huang"],["赵","Zhao"],["吴","Wu"],["周","Zhou"]] },
mongolia: { style: "mononym",
 m: ["Bat-Erdene","Temuulen","Ganbold","Munkhbat","Bilguun","Chuluunbold","Otgonbayar","Naranbaatar"],
 f: ["Oyunaa","Sarnai","Bolormaa","Enkhjargal","Tsetsegmaa","Nomin","Khulan","Altantsetseg"] },
vietnam: { romanFamilyFirst: true,
 m: ["Minh","Huy","Khang","Bao","Phuc","Duc","Quan","Thanh","Nam","Tuan"],
 f: ["Linh","Chi","Ngoc","Thao","Trang","Huong","Mai","Phuong","Ha","Anh"],
 s: ["Nguyen","Tran","Le","Pham","Hoang","Phan","Vu","Dang","Bui","Do"] },
thai: {
 m: ["Somchai","Anan","Kittisak","Thanawat","Nattapong","Chaiwat","Prasert","Teerapat","Worawut","Somsak"],
 f: ["Siriporn","Nittaya","Kanya","Pimchanok","Suda","Malee","Chanida","Apinya","Waraporn","Kamonwan"],
 s: ["Srisuwan","Chaiyasit","Thongchai","Rattanakorn","Suwannarat","Boonmee","Kaewkla","Wongsawat","Intarat","Phromma"] },
lao: {
 m: ["Bounmy","Khamla","Somphone","Sengphet","Vilay","Phonesavanh","Kongkeo","Outhai"],
 f: ["Chanthala","Malaythong","Viengkham","Souphaphone","Daovone","Ketsana","Amphay","Vanida"],
 s: ["Vongsa","Phommachanh","Sisouphanh","Keomany","Inthavong","Chanthavong","Xayasane","Douangdara"] },
khmer: { romanFamilyFirst: true,
 m: ["Sokha","Dara","Rithy","Visal","Samnang","Piseth","Chanthou","Veasna"],
 f: ["Sreymom","Bopha","Channary","Malis","Theary","Sreypov","Kunthea","Sokhem"],
 s: ["Sok","Chea","Kim","Seng","Chan","Heng","Ly","Meas"] },
myanmar: { style: "double_given",
 m: ["Aung","Myint","Zaw","Kyaw","Min","Thura","Htet","Naing","Ye","Soe"],
 f: ["Su","Hla","Aye","Thandar","Khin","Ei","Phyu","Nilar","Sanda","May"] },
indonesia: {
 m: ["Budi","Agus","Andi","Dwi","Eko","Rizky","Fajar","Putra","Adi","Bayu"],
 f: ["Siti","Dewi","Sri","Ayu","Putri","Rina","Indah","Fitri","Lestari","Ratna"],
 s: ["Santoso","Wijaya","Saputra","Pratama","Hidayat","Susanto","Kusuma","Halim","Gunawan","Setiawan"] },
malay: { style: "bin",
 m: ["Ahmad","Faiz","Amirul","Hafiz","Syafiq","Danish","Iqbal","Zulkifli","Azlan","Farhan"],
 f: ["Aisyah","Aminah","Farah","Huda","Aina","Alya","Izzah","Syahirah","Hanis","Balqis"] },
philippines: {
 m: ["Jose","Miguel","Marco","Paolo","Gabriel","Rafael","Joshua","Angelo","Christian","Emilio"],
 f: ["Maria","Angel","Bea","Camille","Jasmine","Andrea","Kathleen","Nicole","Trisha","Liza"],
 s: ["Santos","Reyes","Cruz","Bautista","Garcia","Mendoza","Torres","Flores","Ramos","Aquino"] },
india: {
 m: ["Aarav","Vihaan","Arjun","Rohan","Aditya","Karan","Raj","Vikram","Ankit","Sanjay"],
 f: ["Priya","Ananya","Diya","Kavya","Neha","Pooja","Shreya","Aishwarya","Meera","Lakshmi"],
 s: ["Sharma","Patel","Singh","Kumar","Gupta","Reddy","Iyer","Mehta","Chopra","Nair"] },
pakistan: {
 m: ["Ali","Ahmed","Bilal","Usman","Hamza","Faisal","Imran","Tariq","Zain","Danish"],
 f: ["Ayesha","Fatima","Zainab","Maryam","Sana","Hira","Amna","Rabia","Noor","Mahnoor"],
 s: ["Khan","Malik","Hussain","Sheikh","Butt","Chaudhry","Qureshi","Baig","Mirza","Awan"] },
bengal: {
 m: ["Rahim","Karim","Sohel","Arif","Shakib","Rafiq","Jamal","Habib","Nasir","Tanvir"],
 f: ["Sultana","Nasrin","Farzana","Shirin","Rupa","Taslima","Salma","Jesmin","Rokeya","Sharmin"],
 s: ["Rahman","Islam","Hossain","Ahmed","Chowdhury","Uddin","Miah","Sarkar","Bhuiyan","Sikder"] },
afghan: {
 m: ["Ahmad","Farid","Najib","Rashid","Habibullah","Karim","Zabih","Wali","Sardar","Nawid"],
 f: ["Fatima","Zahra","Maryam","Laila","Nadia","Shabnam","Freshta","Roya","Hosna","Parwana"],
 s: ["Ahmadi","Rahimi","Karimi","Habibi","Noori","Stanikzai","Yusufzai","Sherzai","Hashimi","Safi"] },
nepal: {
 m: ["Ramesh","Bibek","Sujan","Prakash","Dipesh","Niraj","Santosh","Kiran","Bishal","Anish"],
 f: ["Sita","Gita","Anju","Sunita","Puja","Srijana","Manisha","Pratima","Laxmi","Bimala"],
 s: ["Shrestha","Gurung","Tamang","Thapa","Rai","Magar","Adhikari","Karki","Basnet","Lama"] },
srilanka: {
 m: ["Nuwan","Kasun","Chamara","Dinesh","Lahiru","Tharindu","Sampath","Ruwan","Prasad","Isuru"],
 f: ["Nadeesha","Sanduni","Ishara","Dilani","Chamari","Nilmini","Tharushi","Sachini","Kumari","Hansika"],
 s: ["Perera","Fernando","Silva","Jayawardena","Bandara","Wickramasinghe","Gunasekara","Rathnayake","Dissanayake","Herath"] },
bhutan: { style: "double_given",
 m: ["Tshering","Dorji","Sonam","Karma","Pema","Ugyen","Jigme","Kinley"],
 f: ["Dechen","Choden","Wangmo","Selden","Yangchen","Tshomo","Zangmo","Lhamo"] },
persian: {
 m: ["Ali","Reza","Hossein","Mehdi","Amir","Hamid","Saeed","Behnam","Arash","Kaveh"],
 f: ["Zahra","Maryam","Sara","Niloufar","Shirin","Leila","Parisa","Elham","Mahsa","Yasmin"],
 s: ["Hosseini","Ahmadi","Karimi","Moradi","Jafari","Rahimi","Mousavi","Ebrahimi","Sadeghi","Tehrani"] },
turkey: {
 m: ["Mehmet","Mustafa","Ahmet","Emre","Burak","Murat","Kerem","Cem","Halil","Onur"],
 f: ["Ayşe","Fatma","Elif","Zeynep","Merve","Selin","Esra","Derya","Büşra","Gül"],
 s: ["Yılmaz","Kaya","Demir","Şahin","Çelik","Yıldız","Aydın","Özdemir","Arslan","Doğan"] },
central_asia: { fem: "a",
 m: ["Aibek","Nursultan","Timur","Daniyar","Ruslan","Azamat","Bekzat","Yerlan","Farhod","Sherzod"],
 f: ["Aigerim","Dinara","Madina","Aizhan","Gulnara","Saule","Zarina","Kamila","Feruza","Nilufar"],
 s: ["Akhmetov","Omarov","Aliyev","Bekov","Ismailov","Rakhimov","Saidov","Toshev","Yusupov","Nazarov"] },
arabic: {
 m: ["Mohammed","Ahmed","Omar","Youssef","Khaled","Ali","Hassan","Ibrahim","Tarek","Samir"],
 f: ["Fatima","Aisha","Mariam","Layla","Nour","Huda","Salma","Rania","Dalia","Yasmin"],
 s: ["Al-Sayed","Hassan","Ibrahim","Al-Amin","Mansour","Haddad","Khalil","Nasser","Aziz","Farouk"] },
hebrew: {
 m: ["Noam","David","Yosef","Ariel","Itai","Omer","Daniel","Eitan","Amit","Lior"],
 f: ["Noa","Tamar","Maya","Shira","Yael","Michal","Adi","Hila","Rotem","Talia"],
 s: ["Cohen","Levi","Mizrahi","Peretz","Biton","Friedman","Avraham","Shapiro","Azoulay","Katz"] },
somali: { style: "father_given",
 m: ["Abdi","Mohamed","Hassan","Ahmed","Omar","Yusuf","Abdullahi","Farah","Ali","Ismail"],
 f: ["Amina","Fadumo","Hodan","Sagal","Ayan","Zahra","Ubah","Nimo","Khadija","Farhiya"] },
georgia: {
 m: ["Giorgi","Luka","Nika","Davit","Irakli","Levan","Sandro","Zurab"],
 f: ["Nino","Mariam","Tamar","Ana","Salome","Ketevan","Natia","Elene"],
 s: ["Beridze","Kapanadze","Gelashvili","Maisuradze","Lomidze","Tsiklauri","Japaridze","Khutsishvili"] },
armenia: {
 m: ["Armen","Tigran","Hayk","Aram","Vahan","Narek","Gor","Davit"],
 f: ["Ani","Mariam","Lilit","Anahit","Gayane","Nare","Sona","Astghik"],
 s: ["Petrosyan","Hakobyan","Sargsyan","Grigoryan","Harutyunyan","Karapetyan","Vardanyan","Mkrtchyan"] },
russia: { fem: "a",
 m: ["Ivan","Dmitry","Alexei","Sergei","Nikolai","Mikhail","Andrei","Pavel","Viktor","Roman"],
 f: ["Anastasia","Olga","Natalia","Ekaterina","Svetlana","Irina","Tatiana","Maria","Elena","Daria"],
 s: ["Ivanov","Petrov","Smirnov","Kuznetsov","Volkov","Sokolov","Popov","Morozov","Fedorov","Orlov"] },
ukraine: {
 m: ["Taras","Andriy","Oleksandr","Dmytro","Bohdan","Yuriy","Petro","Mykola","Ihor","Vasyl"],
 f: ["Oksana","Iryna","Kateryna","Olena","Sofiya","Yulia","Halyna","Nadiya","Tetiana","Solomiya"],
 s: ["Shevchenko","Kovalenko","Bondarenko","Tkachenko","Melnyk","Kravchenko","Boyko","Lysenko","Moroz","Savchenko"] },
poland: { fem: "ska",
 m: ["Jakub","Piotr","Marek","Tomasz","Krzysztof","Andrzej","Michał","Paweł","Łukasz","Mateusz"],
 f: ["Anna","Katarzyna","Magdalena","Agnieszka","Zofia","Ewa","Julia","Maja","Karolina","Natalia"],
 s: ["Kowalski","Nowak","Wiśniewski","Wójcik","Kamiński","Lewandowski","Zieliński","Szymański","Dąbrowski","Mazur"] },
czech: { fem: "ova",
 m: ["Jan","Petr","Tomáš","Jakub","Martin","Ondřej","Václav","Lukáš","Marek","Milan"],
 f: ["Tereza","Eliška","Anna","Adéla","Lucie","Veronika","Kateřina","Hana","Petra","Jana"],
 s: ["Novák","Svoboda","Dvořák","Černý","Procházka","Kučera","Horák","Beneš","Fiala","Sedláček"] },
romania: {
 m: ["Andrei","Mihai","Alexandru","Ionuț","Ștefan","Vlad","Cristian","Gabriel","Florin","Adrian"],
 f: ["Maria","Elena","Ioana","Andreea","Ana","Cristina","Gabriela","Alina","Raluca","Simona"],
 s: ["Popescu","Ionescu","Popa","Dumitrescu","Stan","Gheorghe","Constantin","Marin","Tudor","Radu"] },
hungary: {
 m: ["Bence","Máté","Levente","Ádám","Dávid","Balázs","Gergő","Zoltán","Tamás","András"],
 f: ["Hanna","Anna","Zsófia","Lili","Emma","Boglárka","Réka","Eszter","Dóra","Petra"],
 s: ["Nagy","Kovács","Tóth","Szabó","Horváth","Varga","Kiss","Molnár","Németh","Farkas"] },
balkan: {
 m: ["Marko","Luka","Stefan","Nikola","Milan","Dušan","Ivan","Petar","Vuk","Filip"],
 f: ["Ana","Milica","Jovana","Marija","Teodora","Sara","Katarina","Jelena","Ivana","Tijana"],
 s: ["Jovanović","Petrović","Nikolić","Marković","Đorđević","Stojanović","Ilić","Pavlović","Kovačević","Popović"] },
albania: {
 m: ["Ardit","Endrit","Luan","Besnik","Ilir","Arben","Gent","Dritan"],
 f: ["Elira","Ariana","Besa","Teuta","Jonida","Albana","Mirela","Drita"],
 s: ["Hoxha","Krasniqi","Berisha","Gashi","Shala","Leka","Marku","Dema"] },
greek: {
 m: ["Giorgos","Dimitris","Nikos","Kostas","Yannis","Panagiotis","Alexandros","Christos","Stavros","Manolis"],
 f: ["Maria","Eleni","Katerina","Sofia","Dimitra","Ioanna","Anna","Despina","Vasiliki","Georgia"],
 s: ["Papadopoulos","Nikolaou","Georgiou","Dimitriou","Papadakis","Vlahos","Economou","Antoniou","Karagiannis","Makris"] },
italy: {
 m: ["Luca","Marco","Alessandro","Francesco","Matteo","Giovanni","Andrea","Davide","Simone","Antonio"],
 f: ["Giulia","Sofia","Martina","Chiara","Francesca","Alessia","Elena","Valentina","Sara","Aurora"],
 s: ["Rossi","Russo","Ferrari","Esposito","Bianchi","Romano","Colombo","Ricci","Marino","Greco"] },
hispanic: { style: "double_family",
 m: ["Santiago","Mateo","Sebastián","Diego","Alejandro","Carlos","Javier","Andrés","Miguel","Emilio"],
 f: ["Sofía","Valentina","Camila","Isabella","Lucía","Mariana","Gabriela","Daniela","Paula","Elena"],
 s: ["García","Rodríguez","Martínez","López","González","Hernández","Pérez","Sánchez","Ramírez","Torres","Flores","Castillo"] },
lusophone: {
 m: ["João","Pedro","Lucas","Gabriel","Rafael","Thiago","Bruno","André","Felipe","Diogo"],
 f: ["Ana","Beatriz","Mariana","Camila","Larissa","Juliana","Carolina","Inês","Letícia","Fernanda"],
 s: ["Silva","Santos","Oliveira","Souza","Pereira","Costa","Almeida","Ferreira","Gomes","Ribeiro"] },
french: {
 m: ["Louis","Lucas","Hugo","Théo","Antoine","Julien","Nicolas","Maxime","Étienne","Baptiste"],
 f: ["Emma","Léa","Chloé","Camille","Manon","Juliette","Claire","Élise","Margaux","Amélie"],
 s: ["Martin","Bernard","Dubois","Moreau","Laurent","Lefebvre","Rousseau","Fournier","Girard","Mercier"] },
german: {
 m: ["Lukas","Leon","Finn","Jonas","Paul","Felix","Maximilian","Elias","Moritz","Niklas"],
 f: ["Emma","Mia","Hannah","Lena","Anna","Leonie","Marie","Sophie","Laura","Clara"],
 s: ["Müller","Schmidt","Schneider","Fischer","Weber","Meyer","Wagner","Becker","Hoffmann","Schäfer"] },
dutch: {
 m: ["Daan","Sem","Lucas","Finn","Bram","Jesse","Thijs","Lars","Ruben","Niels"],
 f: ["Emma","Julia","Sophie","Lotte","Fleur","Sanne","Anouk","Femke","Iris","Noor"],
 s: ["de Jong","Jansen","de Vries","van den Berg","Bakker","Visser","Smit","Meijer","Mulder","de Boer"] },
english: {
 m: ["James","Oliver","Henry","William","Jack","Thomas","Daniel","Samuel","Ethan","Liam","Noah","Benjamin"],
 f: ["Olivia","Emily","Charlotte","Amelia","Grace","Sophie","Emma","Lily","Chloe","Hannah","Ava","Isla"],
 s: ["Smith","Johnson","Brown","Taylor","Wilson","Davies","Miller","Anderson","Thompson","Walker","White","Harris"] },
nordic: {
 m: ["Emil","Oscar","Magnus","Erik","Axel","Anton","Viktor","Elias","Henrik","Mikkel"],
 f: ["Alma","Freja","Astrid","Ida","Ingrid","Maja","Saga","Ella","Sofie","Thea"],
 s: ["Andersen","Johansson","Hansen","Nilsson","Larsen","Eriksson","Olsen","Lindberg","Berg","Dahl"] },
finnish: {
 m: ["Juhani","Mikko","Antti","Jussi","Ville","Eero","Onni","Elias","Aleksi","Tuomas"],
 f: ["Aino","Emilia","Sofia","Helmi","Venla","Iida","Ella","Anni","Kerttu","Sanni"],
 s: ["Korhonen","Virtanen","Mäkinen","Nieminen","Hämäläinen","Laine","Koskinen","Järvinen","Lehtonen","Salminen"] },
baltic: {
 m: ["Lukas","Matas","Jonas","Tomas","Dovydas","Kristaps","Janis","Martins","Kaspars","Andris"],
 f: ["Emilija","Gabija","Ieva","Laura","Liene","Anna","Marta","Elina","Agne","Ruta"],
 s: ["Kazlauskas","Petrauskas","Jankauskas","Balodis","Ozols","Berzins","Kalnins","Urbonas","Butkus","Liepa"] },
iceland: { style: "patronym_is",
 m: ["Jón","Sigurður","Guðmundur","Ólafur","Einar","Magnús","Björn","Kristján"],
 f: ["Guðrún","Anna","Kristín","Margrét","Sigríður","Helga","Katrín","Elín"],
 /* 성 자리에는 아버지 이름의 속격형을 둔다 — +son / +dóttir 로 붙는다 */
 s: ["Jóns","Sigurðar","Guðmunds","Ólafs","Einars","Magnús","Björns","Kristjáns"] },
/* 나이지리아 기본 풀 — 3대 민족이 섞인 폴백이다. 요루바·이그보·하우사·풀라니로 뽑힌
   생은 ETHNIC_CULTURE 가 아래 전용 풀로 보낸다("기타" 33%만 여기로 온다). */
nigeria: {
 m: ["Chinedu","Emeka","Oluwaseun","Tunde","Ibrahim","Musa","Chukwuemeka","Ade","Ifeanyi","Sani"],
 f: ["Chioma","Ngozi","Aisha","Funmilayo","Amaka","Yetunde","Halima","Adaeze","Bisi","Zainab"],
 s: ["Okafor","Adeyemi","Balogun","Okonkwo","Abubakar","Eze","Adebayo","Nwosu","Mohammed","Olawale"] },
yoruba: {
 m: ["Ayodele","Olumide","Babatunde","Adewale","Kehinde","Taiwo","Segun","Femi"],
 f: ["Yetunde","Funmilayo","Bisi","Titilayo","Folake","Ronke","Bunmi","Kemi"],
 s: ["Adeyemi","Balogun","Olawale","Adebayo","Ogunleye","Afolabi","Akintola","Oyebanjo"] },
igbo: {
 m: ["Chinedu","Emeka","Ifeanyi","Chukwuemeka","Obinna","Nnamdi","Kelechi","Uche"],
 f: ["Chioma","Ngozi","Amaka","Adaeze","Chiamaka","Nneka","Ifeoma","Uju"],
 s: ["Okafor","Okonkwo","Eze","Nwosu","Okoro","Anyanwu","Obi","Nwachukwu"] },
hausa: {
 m: ["Ibrahim","Musa","Sani","Abubakar","Aliyu","Usman","Bello","Yusuf"],
 f: ["Aisha","Halima","Zainab","Fatima","Amina","Hadiza","Maryam","Safiya"],
 s: ["Abubakar","Mohammed","Bello","Garba","Danjuma","Yakubu","Suleiman","Idris"] },
south_india: {
 m: ["Arun","Karthik","Suresh","Ramesh","Vijay","Ganesh","Hari","Senthil"],
 f: ["Priya","Lakshmi","Divya","Kavitha","Meena","Anitha","Deepa","Revathi"],
 s: ["Krishnan","Iyer","Nair","Menon","Subramaniam","Pillai","Naidu","Raman"] },
ghana: {
 m: ["Kwame","Kofi","Kwesi","Yaw","Kojo","Kwabena","Fiifi","Kweku"],
 f: ["Ama","Akosua","Efua","Abena","Adwoa","Yaa","Esi","Afia"],
 s: ["Mensah","Osei","Boateng","Asante","Owusu","Appiah","Agyeman","Annan"] },
west_africa: {
 m: ["Amadou","Mamadou","Ousmane","Ibrahima","Moussa","Sekou","Abdoulaye","Cheikh","Boubacar","Lamine"],
 f: ["Aminata","Fatoumata","Mariama","Awa","Kadiatou","Aissatou","Rokhaya","Bintou","Salimata","Coumba"],
 s: ["Diallo","Traoré","Diop","Ndiaye","Keita","Cissé","Touré","Sow","Camara","Koné"] },
east_africa: {
 m: ["Juma","Amani","Musa","Daudi","Emmanuel","Peter","Joseph","David","Brian","Kevin"],
 f: ["Neema","Zawadi","Amina","Grace","Faith","Mercy","Esther","Joyce","Rehema","Upendo"],
 s: ["Mwangi","Otieno","Kamau","Odhiambo","Njoroge","Mushi","Massawe","Okello","Wanjala","Kiprotich"] },
ethiopia: { style: "father_given",
 m: ["Abebe","Tesfaye","Getachew","Dawit","Yonas","Bekele","Haile","Solomon","Mulugeta","Girma"],
 f: ["Almaz","Tigist","Hiwot","Selam","Marta","Genet","Meseret","Bethlehem","Rahel","Sara"] },
rwanda: {
 m: ["Jean","Emmanuel","Eric","Claude","Olivier","Pacifique","Innocent","Fabrice"],
 f: ["Claudine","Immaculée","Divine","Clarisse","Josiane","Aline","Chantal","Ange"],
 s: ["Niyonzima","Habimana","Uwase","Mugisha","Ndayisaba","Nsengiyumva","Ishimwe","Byiringiro"] },
southern_africa: {
 m: ["Sipho","Thabo","Tendai","Kagiso","Bongani","Tawanda","Mpho","Lefa","Musa","Blessing"],
 f: ["Thandiwe","Nomvula","Chipo","Lerato","Rudo","Palesa","Zanele","Naledi","Precious","Busisiwe"],
 s: ["Moyo","Ncube","Dube","Khumalo","Sibanda","Mokoena","Molefe","Chirwa","Banda","Phiri"] },
central_africa: {
 m: ["Jean-Pierre","Patrice","Serge","Blaise","Christian","Armand","Landry","Rodrigue"],
 f: ["Sylvie","Nadège","Clarisse","Chantal","Micheline","Solange","Laetitia","Prisca"],
 s: ["Mbemba","Nguema","Okemba","Moukoko","Bemba","Ilunga","Kalonji","Mavungu"] },
madagascar: {
 m: ["Andry","Hery","Tahina","Mamy","Njaka","Rija","Solofo","Toky"],
 f: ["Voahangy","Lalao","Hanta","Mialy","Fara","Vero","Nirina","Soa"],
 s: ["Rakotoarisoa","Randrianarivelo","Andrianina","Rasolofo","Razafindrakoto","Rakotomalala","Ravelojaona","Andriamahefa"] },
pacific: {
 m: ["Sione","Tevita","Manu","Josefa","Semisi","Taniela","Viliame","Iosefo"],
 f: ["Mele","Ana","Sina","Litia","Salote","Losana","Teuila","Miriama"],
 s: ["Tuilagi","Fifita","Taufa","Naupoto","Havili","Latu","Tupou","Vunipola"] },
};

/* 국가(한국어명) → 문화권. BODY와 같은 규약 — 빠진 나라가 있으면 rollName이 즉시 던진다.
   다민족 국가(나이지리아·인도 등)의 민족별 세분화는 다음 단계 후보다. */
const CULTURE_OF: Record<string, string> = {
 중국:"china",인도:"india",일본:"japan",대한민국:"korea",북한:"korea",대만:"china",홍콩:"china",마카오:"china",몽골:"mongolia",
 인도네시아:"indonesia",필리핀:"philippines",베트남:"vietnam",태국:"thai",미얀마:"myanmar",말레이시아:"malay",캄보디아:"khmer",라오스:"lao",싱가포르:"china",동티모르:"lusophone",브루나이:"malay",
 파키스탄:"pakistan",방글라데시:"bengal",아프가니스탄:"afghan",네팔:"nepal",스리랑카:"srilanka",부탄:"bhutan",몰디브:"arabic",
 카자흐스탄:"central_asia",우즈베키스탄:"central_asia",타지키스탄:"central_asia",키르기스스탄:"central_asia",투르크메니스탄:"central_asia",아제르바이잔:"central_asia",조지아:"georgia",아르메니아:"armenia",
 이란:"persian",튀르키예:"turkey",이라크:"arabic",사우디아라비아:"arabic",예멘:"arabic",시리아:"arabic",요르단:"arabic",아랍에미리트:"arabic",이스라엘:"hebrew",팔레스타인:"arabic",레바논:"arabic",오만:"arabic",쿠웨이트:"arabic",카타르:"arabic",바레인:"arabic",
 러시아:"russia",독일:"german",영국:"english",프랑스:"french",이탈리아:"italy",스페인:"hispanic",폴란드:"poland",우크라이나:"ukraine",루마니아:"romania",네덜란드:"dutch",벨기에:"dutch",체코:"czech",스웨덴:"nordic",포르투갈:"lusophone",그리스:"greek",헝가리:"hungary",오스트리아:"german",벨라루스:"russia",스위스:"german",세르비아:"balkan",불가리아:"balkan",덴마크:"nordic",핀란드:"finnish",노르웨이:"nordic",슬로바키아:"czech",아일랜드:"english",크로아티아:"balkan","보스니아 헤르체고비나":"balkan",몰도바:"romania",리투아니아:"baltic",알바니아:"albania",슬로베니아:"balkan",라트비아:"baltic",북마케도니아:"balkan",코소보:"albania",에스토니아:"baltic",키프로스:"greek",룩셈부르크:"german",몬테네그로:"balkan",몰타:"italy",아이슬란드:"iceland",안도라:"hispanic",리히텐슈타인:"german",모나코:"french",산마리노:"italy",
 미국:"english",멕시코:"hispanic",캐나다:"english",과테말라:"hispanic",아이티:"french",도미니카공화국:"hispanic",쿠바:"hispanic",온두라스:"hispanic",니카라과:"hispanic",엘살바도르:"hispanic",코스타리카:"hispanic",파나마:"hispanic",자메이카:"english","트리니다드 토바고":"english",바하마:"english",벨리즈:"english",바베이도스:"english",세인트루시아:"english",그레나다:"english","세인트빈센트 그레나딘":"english","앤티가 바부다":"english","도미니카 연방":"english","세인트키츠 네비스":"english",
 브라질:"lusophone",콜롬비아:"hispanic",아르헨티나:"hispanic",페루:"hispanic",베네수엘라:"hispanic",칠레:"hispanic",에콰도르:"hispanic",볼리비아:"hispanic",파라과이:"hispanic",우루과이:"hispanic",가이아나:"english",수리남:"dutch",
 나이지리아:"nigeria",에티오피아:"ethiopia",이집트:"arabic",콩고민주공화국:"central_africa",탄자니아:"east_africa",남아프리카공화국:"southern_africa",케냐:"east_africa",수단:"arabic",우간다:"east_africa",알제리:"arabic",모로코:"arabic",앙골라:"lusophone",모잠비크:"lusophone",가나:"ghana",코트디부아르:"west_africa",마다가스카르:"madagascar",카메룬:"central_africa",니제르:"west_africa",말리:"west_africa",부르키나파소:"west_africa",말라위:"southern_africa",잠비아:"southern_africa",차드:"arabic",소말리아:"somali",세네갈:"west_africa",짐바브웨:"southern_africa",기니:"west_africa",베냉:"west_africa",르완다:"rwanda",부룬디:"rwanda",튀니지:"arabic",남수단:"east_africa",토고:"west_africa",시에라리온:"west_africa",리비아:"arabic",콩고공화국:"central_africa",라이베리아:"english",중앙아프리카공화국:"central_africa",모리타니:"arabic",에리트레아:"ethiopia",나미비아:"southern_africa",감비아:"west_africa",보츠와나:"southern_africa",가봉:"central_africa",레소토:"southern_africa",기니비사우:"lusophone",적도기니:"hispanic",모리셔스:"india",에스와티니:"southern_africa",지부티:"somali",코모로:"arabic",카보베르데:"lusophone","상투메 프린시페":"lusophone",세이셸:"french",
 호주:"english",파푸아뉴기니:"pacific",뉴질랜드:"english",피지:"pacific",솔로몬제도:"pacific",바누아투:"pacific",사모아:"pacific",키리바시:"pacific",미크로네시아:"pacific",통가:"pacific",마셜제도:"pacific",팔라우:"pacific",나우루:"pacific",투발루:"pacific",
};

/* ===== 민족별 세분화 =====
   같은 나라라도 민족에 따라 이름 전통이 완전히 다르다 — 나이지리아의 요루바와 하우사,
   말레이시아의 말레이계와 중국계, 미국의 히스패닉처럼. 생에는 이미 민족이 뽑혀 있으므로
   (BODY 데이터), 그 민족이 아래 표에 있으면 국가 기본 풀 대신 그 문화권 풀을 쓴다.

   ⚠ 표는 **국가별**이다. "백인"·"아시아계" 같은 라벨은 나라마다 뜻이 다르기 때문이다
   (남아공 백인=아프리칸스, 미국 백인=english / 영국 아시아계=남아시아, 미국 아시아계=혼합).
   전역 라벨 매핑을 만들면 조용히 엉뚱한 풀로 간다.
   민족 이름은 i18n-terms 사전의 한국어 키 그대로다(BODY와 같은 규약).

   표에 없는 민족("기타"·"혼혈"·다수 민족 등)은 국가 기본 풀로 간다 — 오버라이드는
   "이름 전통이 뚜렷이 다른" 소수집단에만 건다. 너무 촘촘히 걸면 데이터만 늘고,
   기본 풀이 이미 그 나라 다수의 이름이다. */
const ETHNIC_CULTURE: Record<string, Record<string, string>> = {
 나이지리아: { 하우사: "hausa", 요루바: "yoruba", 이그보: "igbo", 풀라니: "hausa" },
 인도: { 드라비다계: "south_india" },
 스리랑카: { "스리랑카 타밀": "south_india", 무어: "arabic" },
 말레이시아: { 중국계: "china", 인도계: "india" },
 싱가포르: { 말레이계: "malay", 인도계: "india" },
 홍콩: { 필리핀계: "philippines", 인도네시아계: "indonesia" },
 미국: { 히스패닉: "hispanic" },
 영국: { 아시아계: "india" },            /* 영국 통계의 Asian은 남아시아계다 */
 프랑스: { 북아프리카계: "arabic" },
 독일: { 튀르키예계: "turkey" },
 스위스: { 이탈리아계: "italy" },
 이스라엘: { 아랍계: "arabic" },
 세르비아: { 헝가리계: "hungary" },
 슬로바키아: { 헝가리계: "hungary" },
 루마니아: { 헝가리계: "hungary" },
 불가리아: { 튀르키예계: "turkey" },
 북마케도니아: { 알바니아계: "albania", 튀르키예계: "turkey" },
 코소보: { 세르비아계: "balkan" },
 벨라루스: { 폴란드계: "poland" },
 우크라이나: { 러시아계: "russia" },
 몰도바: { 우크라이나계: "ukraine" },
 리투아니아: { 폴란드계: "poland", 러시아계: "russia" },
 라트비아: { 러시아계: "russia" },
 에스토니아: { 러시아계: "russia" },
 카자흐스탄: { 러시아계: "russia" },
 키르기스스탄: { 러시아계: "russia" },
 에티오피아: { 소말리: "somali" },
 차드: { 사라: "central_africa" },       /* 남부 사라족은 프랑스식 이름 전통이다 */
 카메룬: { 풀라니: "west_africa" },
 남아프리카공화국: { 백인: "dutch", "인도·아시아계": "india" },  /* 백인 다수가 아프리칸스계 */
 모리셔스: { 크리올: "french", 중국계: "china", 프랑스계: "french" },
 아랍에미리트: { 남아시아계: "india" },
 오만: { 남아시아계: "india" },
 쿠웨이트: { 남아시아계: "india" },
 카타르: { 남아시아계: "india" },
 바레인: { 남아시아계: "india" },
 피지: { 인도계: "india" },
 "트리니다드 토바고": { 동인도계: "india" },
 가이아나: { 동인도계: "india" },
 수리남: { 힌두스탄계: "india", 자바계: "indonesia" },
 뉴질랜드: { 마오리: "pacific", 태평양계: "pacific" },
 팔라우: { 필리핀계: "philippines" },
};

function part(e: Entry): NamePart {
  return typeof e === "string" ? { n: e, l: e } : { n: e[0], l: e[1] };
}
/** 여성형 성 (러시아권 -a · 폴란드 -ska · 체코 -ová) */
function femForm(rule: Culture["fem"], p: NamePart): NamePart {
  if (!rule) return p;
  const l = p.l;
  let out = l;
  if (rule === "a") { if (/(ov|ev|in)$/.test(l)) out = l + "a"; }
  else if (rule === "ska") { if (l.endsWith("ski")) out = l.slice(0, -1) + "a"; }
  else if (rule === "ova") {
    if (l.endsWith("ý")) out = l.slice(0, -1) + "á";
    else if (l.endsWith("a")) out = l.slice(0, -1) + "ová";
    else out = l + "ová";
  }
  return { n: out, l: out };
}

/** 이 생의 이름. 사인처럼 고정값에서 결정적으로 정해진다 — 같은 생은 언제나 같은 이름. */
export function rollName(l: NameInput): LifeName {
  /* 민족 오버라이드가 국가 기본을 이긴다 — 표에 있는 민족만(위 ETHNIC_CULTURE 주석 참고) */
  const ethName = l.eth?.[0];
  const cultureKey =
    (ethName ? ETHNIC_CULTURE[l.c.name]?.[ethName] : undefined) ?? CULTURE_OF[l.c.name];
  if (!cultureKey || !POOLS[cultureKey]) {
    throw new Error(`rollName: '${l.c.name}' 의 이름 문화권 매핑이 없습니다 (names.ts CULTURE_OF)`);
  }
  const cult = POOLS[cultureKey]!;
  const seed = strHash(["nm", isoCode(l.c.flag), l.lifeExp, Math.round(l.income), l.iq,
    l.height, Math.round(l.weight * 10)].join("|"));
  const rng = mulberry32(seed);
  const pool = l.male ? cult.m : cult.f;
  const gi = Math.floor(rng() * pool.length);
  const given = part(pool[gi]!);
  const style: Style = cult.style ?? "family";

  let family: NamePart | null = null;
  let family2: NamePart | null = null;
  if (style === "family" || style === "double_family" || style === "patronym_is") {
    const s = cult.s!;
    const fi = Math.floor(rng() * s.length);
    family = part(s[fi]!);
    if (style === "family" && !l.male) family = femForm(cult.fem, family);
    if (style === "double_family") {
      let f2 = Math.floor(rng() * s.length);
      if (f2 === fi) f2 = (f2 + 1) % s.length;
      family2 = part(s[f2]!);
    }
  } else if (style === "double_given") {
    let si = Math.floor(rng() * pool.length);
    if (si === gi) si = (si + 1) % pool.length;
    family = part(pool[si]!);
  } else if (style === "bin" || style === "father_given") {
    family = part(cult.m[Math.floor(rng() * cult.m.length)]!);
  }
  return { given, family, family2, culture: cultureKey, male: l.male };
}

/** 로마자 전체 이름(서구식 표기). 문화권 어순·형식 규칙을 따른다. */
function latinForm(name: LifeName): string {
  const cult = POOLS[name.culture]!;
  const g = name.given.l, f = name.family?.l ?? "", f2 = name.family2?.l ?? "";
  switch (cult.style ?? "family") {
    case "mononym": return g;
    case "double_given": return `${g} ${f}`;
    case "bin": return `${g} ${name.male ? "bin" : "binti"} ${f}`;
    case "patronym_is": return `${g} ${f}${name.male ? "son" : "dóttir"}`;
    case "father_given": return `${g} ${f}`;
    case "double_family": return `${g} ${f} ${f2}`;
    default: return cult.romanFamilyFirst ? `${f} ${g}` : `${g} ${f}`;
  }
}
/** 원문자 전체 이름 — korea·japan·china만 존재한다. 그 외 문화권은 null. */
function nativeForm(name: LifeName): string | null {
  const cult = POOLS[name.culture]!;
  if (!cult.native || !name.family) return null;
  if (cult.native === "ja") return `${name.family.n} ${name.given.n}`;
  return `${name.family.n}${name.given.n}`;   /* ko·zh: 성이름 붙여쓰기 */
}

/** UI 언어에 맞는 주 표기. 예: 한국 생 → ko에서 "김희서", en에서 "Heeseo Kim". */
export function formatLifeName(name: LifeName, lang: UiLang): string {
  const cult = POOLS[name.culture]!;
  if (cult.native && cult.native === lang) return nativeForm(name) ?? latinForm(name);
  return latinForm(name);
}
/** 반대 표기(설명줄용). 원문자가 따로 없는 문화권은 null. */
export function altLifeName(name: LifeName, lang: UiLang): string | null {
  const cult = POOLS[name.culture]!;
  if (!cult.native) return null;
  return cult.native === lang ? latinForm(name) : nativeForm(name);
}
/** 검증용: 어떤 문화권이 존재하고 몇 개국이 매핑됐는지 */
export const NAME_CULTURES = Object.keys(POOLS);
export function nameCultureOf(countryName: string): string | undefined {
  return CULTURE_OF[countryName];
}
