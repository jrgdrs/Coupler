// ══════════════════════════════════════════════════════
// TESTPAGE
// ══════════════════════════════════════════════════════
const LOREM={
  en:`Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam eaque ipsa quae ab illo inventore veritatis.`,
  de:`Zwei Hunde kommen durch den Wald. Der erste Hund sagt: »Ich glaube, wir sind allein hier.« Der zweite Hund antwortet: »Seltsam, ich dachte, ich hätte jemanden kommen hören.« — Obwohl die Wege sich oft kreuzen, vergisst man leicht, dass jeder seinen eigenen Horizont trägt. Die Zeiten ändern sich, und mit ihnen die Überzeugungen der Menschen. Was gestern noch als unverrückbar galt, wird heute von neuen Erkenntnissen herausgefordert. Über allem steht die Frage: Wohin führt uns dieser Weg?`,
  nl:`In een ver land waar de wind door de velden speelt en de rivieren traag naar zee stromen, leefde een oude boer met zijn zoon. Elke ochtend stonden zij vroeg op om het werk te beginnen. De wereld was groot, maar hun wereld klein en vertrouwd. Zij spraken weinig, maar verstonden elkaar goed. De ooievaars keerden elk voorjaar terug en brachten nieuws uit verre streken mee. Het leven was eenvoudig, maar rijk aan stille vreugde.`,
  fr:`La vie est une succession de moments qui s'écoulent comme l'eau d'une rivière. On ne peut pas retenir le temps, mais on peut choisir comment on l'habite. Les philosophes ont longtemps cherché à définir le bonheur, sans jamais en donner une réponse définitive. Peut-être est-ce là la beauté de la question — elle invite chacun à trouver sa propre réponse. Les saisons passent, les générations se succèdent, et pourtant quelque chose demeure, impalpable et précieux.`,
  it:`Nel mezzo del cammin di nostra vita ci ritrovammo per una selva oscura, ché la diritta via era smarrita. Ahi quanto a dir qual era è cosa dura questa selva selvaggia e aspra e forte che nel pensier rinova la paura. Tant'è amara che poco è più morte. Ma per trattar del ben ch'i' vi trovai, dirò de l'altre cose ch'i' v'ho scorte. Io non so ben ridir com'i' v'intrai, tant'era pien di sonno a quel punto che la verace via abbandonai.`,
  da:`Det var en stille aften i september, da solen langsomt sank bag de fjerne bakker og det gyldne lys lagde sig over markerne. Fuglene var holdt op med at synge, og en enkelt ko stod og stirrede eftertænksomt ud over hegnet. I landsbyen nedenfor begyndte man at tænde lamperne, og røgen fra skorstenene steg op i den stille luft. Børnene legede endnu i gaderne, men mødrene kaldte dem snart ind til aftensmaden.`
};

function openTestPage(){
  if(IS_GLYPHS){alert('Testpage is only available in browser mode.');return;}
  if(!fontObj){alert('Please load a font first.');return;}
  const p=P();
  const fn=fontObj.names.fullName?.en||fontName;
  const upm=fontObj.unitsPerEm||1000;
  const nonZero=kerningData.filter(d=>d.correction!==0);
  const kMap={};nonZero.forEach(d=>{kMap[d.left+':'+d.right]=d.correction;});
  const _SN={'002E':'period','002C':'comma','0027':'quotesingle','002D':'hyphen','003B':'semicolon','003A':'colon'};
  function gLbl(ch){const g=fontObj.charToGlyph(ch);if(!g||g.index===0)return ch;const u=g.unicodes&&g.unicodes[0];if(u!=null){const h=u.toString(16).toUpperCase().padStart(4,'0');if(_SN[h])return _SN[h];if(g.name&&!/^glyph\d+$/i.test(g.name))return g.name;try{return String.fromCodePoint(u);}catch(_){}}return g.name||ch;}
  function escH(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function kH(t){let h='';for(let i=0;i<t.length;i++){const c=t[i];if(c===' '){h+=' ';continue;}const gn=gLbl(c);const nc=t[i+1];const k=nc&&nc!==' '?kMap[gn+':'+gLbl(nc)]||0:0;const e=escH(c);h+=k?'<span style="letter-spacing:'+(k/upm).toFixed(5)+'em">'+e+'<\/span>':e;}return h;}
  const S=[
    {hdr:'16/32pt  UC kerning proof – every glyph between every glyph',fs:16,lh:32,lines:[
      `AAABACADAEAFAGAHAIAJAKALAMANAOAPAQARASATAUAVAWAXAYAZA`,
      `BABBBCBDBEBFBGBHBIBJBKBLBMBNBOBPBQBRBSBTBUBVBWBXBYBZB`,
      `CACBCCCDCECFCGCHCICJCKCLCMCNCOCPCQCRCSCTCUCVCWCXCYCZC`,
      `DADBDCDDDEDFDGDHDIDJDKDLDMDNDODPDQDRDSDTDUDVDWDXDYDZD`,
      `EAEBECEDEEEFEGEHEIEJEKELEMENEOEPEQERESETEUEVEWEXEYEZE`,
      `FAFBFCFDFEFFFGFHFIFJFKFLFMFNFOFPFQFRFSFTFUFVFWFXFYFZF`,
      `GAGBGCGDGEGFGGGHGIGJGKGLGMGNGOGPGQGRGSGTGUGVGWGXGYGZG`,
      `HAHBHCHDHEHFHGHHHIHJHKHLHMHNHOHPHQHRHSHTHUHVHWHXHYHZH`,
      `IAIBICIDIEIFIGIHIIIJIKILIMINIOIPIQIRISITIUIVIWIXIYIZI`,
      `JAJBJCJDJEJFJGJHJIJJJKJLJMJNJOJPJQJRJSJTJUJVJWJXJYJZJ`,
      `KAKBKCKDKEKFKGKHKIKJKKKLKMKNKOKPKQKRKSKTKUKVKWKXKYKZK`,
      `LALBLCLDLELFLGLHLILJLKLLLMLNLOLPLQLRLSLTLULVLWLXLYLZL`,
      `MAMBMCMDMEMFMGMHMIMJMKMLMMMNMOMPMQMRMSMTMUMVMWMXMYMZM`,
      `NANBNCNDNENFNGNHNINJNKNLNMNNNONPNQNRNSNTNUNVNWNXNYNZN`,
      `OAOBOCODOEOFOGOHOIOJOKOLOMONOOOPOQOROSOTOUOVOWOXOYOZO`,
      `PAPBPCPDPEPFPGPHPIPJPKPLPMPNPOPPPQPRPSPTPUPVPWPXPYPZP`,
      `QAQBQCQDQEQFQGQHQIQJQKQLQMQNQOQPQQQRQSQTQUQVQWQXQYQZQ`,
      `RARBRCRDRERFRGRHRIRJRKRLRMRNRORPRQRRRSRTRURVRWRXRYRZR`,
      `SASBSCSDSESFSGSHSISJSKSLSMSNSOSPSQSRSSSTSUSVSWSXSYSZS`,
      `TATBTCTDTETFTGTHTITJTKTLTMTNTOTPTQTRTSTTTUTVTWTXTYTZT`,
      `UAUBUCUDUEUFUGUHUIUJUKULUMUNUOUPUQURUSUTUUUVUWUXUYUZU`,
      `VAVBVCVDVEVFVGVHVIVJVKVLVMVNVOVPVQVRVSVTVUVVVWVXVYVZV`,
      `WAWBWCWDWEWFWGWHWIWJWKWLWMWNWOWPWQWRWSWTWUWVWWWXWYWZW`,
      `XAXBXCXDXEXFXGXHXIXJXKXLXMXNXOXPXQXRXSXTXUXVXWXXXYXZX`,
      `YAYBYCYDYEYFYGYHYIYJYKYLYMYNYOYPYQYRYSYTYUYVYWYXYYYZY`,
      `ZAZBZCZDZEZFZGZHZIZJZKZLZMZNZOZPZQZRZSZTZUZVZWZXZYZZZ`,
    ]},
    {hdr:'16/32pt  LC kerning proof – every glyph between every glyph',fs:16,lh:32,lines:[
      `aaabacadaeafagahaiajakalamanaoapaqarasatauavawaxayaza`,
      `babbbcbdbebfbgbhbibjbkblbmbnbobpbqbrbsbtbubvbwbxbybzb`,
      `cacbcccdcecfcgchcicjckclcmcncocpcqcrcsctcucvcwcxcyczc`,
      `dadbdcdddedfdgdhdidjdkdldmdndodpdqdrdsdtdudvdwdxdydzd`,
      `eaebecedeeefegeheiejekelemeneoepeqereseteuevewexeyeze`,
      `fafbfcfdfefffgfhfifjfkflfmfnfofpfqfrfsftfufvfwfxfyfzf`,
      `gagbgcgdgegfggghgigjgkglgmgngogpgqgrgsgtgugvgwgxgygzg`,
      `hahbhchdhehfhghhhihjhkhlhmhnhohphqhrhshthuhvhwhxhyhzh`,
      `iaibicidieifigihiiijikiliminioipiqirisitiuiviwixiyizi`,
      `jajbjcjdjejfjgjhjijjjkjljmjnjojpjqjrjsjtjujvjwjxjyjzj`,
      `kakbkckdkekfkgkhkikjkkklkmknkokpkqkrksktkukvkwkxkykzk`,
      `lalblcldlelflglhliljlklllmlnlolplqlrlsltlulvlwlxlylzl`,
      `mambmcmdmemfmgmhmimjmkmlmmmnmompmqmrmsmtmumvmwmxmymzm`,
      `nanbncndnenfngnhninjnknlnmnnnonpnqnrnsntnunvnwnxnynzn`,
      `oaobocodoeofogohoiojokolomonooopoqorosotouovowoxoyozo`,
      `papbpcpdpepfpgphpipjpkplpmpnpopppqprpsptpupvpwpxpypzp`,
      `qaqbqcqdqeqfqgqhqiqjqkqlqmqnqoqpqqqrqsqtquqvqwqxqyqzq`,
      `rarbrcrdrerfrgrhrirjrkrlrmrnrorprqrrrsrtrurvrwrxryrzr`,
      `sasbscsdsesfsgshsisjskslsmsnsospsqsrssstsusvswsxsyszs`,
      `tatbtctdtetftgthtitjtktltmtntotptqtrtstttutvtwtxtytzt`,
      `uaubucudueufuguhuiujukulumunuoupuqurusutuuuvuwuxuyuzu`,
      `vavbvcvdvevfvgvhvivjvkvlvmvnvovpvqvrvsvtvuvvvwvxvyvzv`,
      `wawbwcwdwewfwgwhwiwjwkwlwmwnwowpwqwrwswtwuwvwwwxwywzw`,
      `xaxbxcxdxexfxgxhxixjxkxlxmxnxoxpxqxrxsxtxuxvxwxxxyxzx`,
      `yaybycydyeyfygyhyiyjykylymynyoypyqyrysytyuyvywyxyyyzy`,
      `zazbzczdzezfzgzhzizjzkzlzmznzozpzqzrzsztzuzvzwzxzyzzz`,
    ]},
    {hdr:'16/32pt  LC/UC kerning – punctuation + every glyph',fs:16,lh:32,lines:[
      `|a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|`,
      `.a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.`,
      `,a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,`,
      `:a:b:c:d:e:f:g:h:i:j:k:l:m:n:o:p:q:r:s:t:u:v:w:x:y:z:`,
      `;a;b;c;d;e;f;g;h;i;j;k;l;m;n;o;p;q;r;s;t;u;v;w;x;y;z;`,
      `•a•b•c•d•e•f•g•h•i•j•k•l•m•n•o•p•q•r•s•t•u•v•w•x•y•z•`,
      `-a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-u-v-w-x-y-z-`,
      `—a—b—c—d—e—f—g—h—i—j—k—l—m—n—o—p—q—r—s—t—u—v—w—x—y—z—`,
      `/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z/`,
      `\\a\\b\\c\\d\\e\\f\\g\\h\\i\\j\\k\\l\\m\\n\\o\\p\\q\\r\\s\\t\\u\\v\\w\\x\\y\\z\\`,
      `»a« »b« »c« »d« »e« »f« »g« »h« »i« »j« »k« »l« »m« »n« »o« »p« »q« »r« »s« »t« »u« »v« »w« »x« »y« »z«`,
      `«a» «b» «c» «d» «e» «f» «g» «h» «i» «j» «k» «l» «m» «n» «o» «p» «q» «r» «s» «t» «u» «v» «w» «x» «y» «z»`,
      `"a" "b" "c" "d" "e" "f" "g" "h" "i" "j" "k" "l" "m" "n" "o" "p" "q" "r" "s" "t" "u" "v" "w" "x" "y" "z"`,
      `nn'a nn'b nn'c nn'd nn'e nn'f nn'g nn'h nn'i nn'j nn'k nn'l nn'm nn'n nn'o nn'p nn'q nn'r nn's nn't nn'u nn'v nn'w nn'x nn'y nn'z`,
      `na'n nb'n nc'n nd'n ne'n nf'n ng'n nh'n ni'n nj'n nk'n nl'n nm'n nn'n no'n np'n nq'n nr'n ns'n nt'n nu'n nv'n nw'n nx'n ny'n nz'n`,
      `!a!b!c!d!e!f!g!h!i!j!k!l!m!n!o!p!q!r!s!t!u!v!w!x!y!z!`,
      `¡a ¡b ¡c ¡d ¡e ¡f ¡g ¡h ¡i ¡j ¡k ¡l ¡m ¡n ¡o ¡p ¡q ¡r ¡s ¡t ¡u ¡v ¡w ¡x ¡y ¡z`,
      `?a?b?c?d?e?f?g?h?i?j?k?l?m?n?o?p?q?r?s?t?u?v?w?x?y?z?`,
      `¿a ¿b ¿c ¿d ¿e ¿f ¿g ¿h ¿i ¿j ¿k ¿l ¿m ¿n ¿o ¿p ¿q ¿r ¿s ¿t ¿u ¿v ¿w ¿x ¿y ¿z`,
      `non@noo @a@b@c@d@e@f@g@h@i@j@k@l@m@n@o@p@q@r@s@t@u@v@w@x@y@z@`,
      `*a*b*c*d*e*f*g*h*i*j*k*l*m*n*o*p*q*r*s*t*u*v*w*x*y*z*`,
      `°a°b°c°d°e°f°g°h°i°j°k°l°m°n°o°p°q°r°s°t°u°v°w°x°y°z°`,
      `"a"b"c"d"e"f"g"h"i"j"k"l"m"n"o"p"q"r"s"t"u"v"w"x"y"z"`,
      `™a™b™c™d™e™f™g™h™i™j™k™l™m™n™o™p™q™r™s™t™u™v™w™x™y™z™`,
      `[a] [b] [c] [d] [e] [f] [g] [h] [i] [j] [k] [l] [m] [n] [o] [p] [q] [r] [s] [t] [u] [v] [w] [x] [y] [z]`,
      `(a) (b) (c) (d) (e) (f) (g) (h) (i) (j) (k) (l) (m) (n) (o) (p) (q) (r) (s) (t) (u) (v) (w) (x) (y) (z)`,
      `{a} {b} {c} {d} {e} {f} {g} {h} {i} {j} {k} {l} {m} {n} {o} {p} {q} {r} {s} {t} {u} {v} {w} {x} {y} {z}`,
      `|A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|Q|R|S|T|U|V|W|X|Y|Z|`,
      `.A.B.C.D.E.F.G.H.I.J.K.L.M.N.O.P.Q.R.S.T.U.V.W.X.Y.Z.`,
      `,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,`,
      `:A:B:C:D:E:F:G:H:I:J:K:L:M:N:O:P:Q:R:S:T:U:V:W:X:Y:Z:`,
      `;A;B;C;D;E;F;G;H;I;J;K;L;M;N;O;P;Q;R;S;T;U;V;W;X;Y;Z;`,
      `•A•B•C•D•E•F•G•H•I•J•K•L•M•N•O•P•Q•R•S•T•U•V•W•X•Y•Z•`,
      `-A-B-C-D-E-F-G-H-I-J-K-L-M-N-O-P-Q-R-S-T-U-V-W-X-Y-Z-`,
      `—A—B—C—D—E—F—G—H—I—J—K—L—M—N—O—P—Q—R—S—T—U—V—W—X—Y—Z—`,
      `/A/B/C/D/E/F/G/H/I/J/K/L/M/N/O/P/Q/R/S/T/U/V/W/X/Y/Z/`,
      `\\A\\B\\C\\D\\E\\F\\G\\H\\I\\J\\K\\L\\M\\N\\O\\P\\Q\\R\\S\\T\\U\\V\\W\\X\\Y\\Z\\`,
      `»A« »B« »C« »D« »E« »F« »G« »H« »I« »J« »K« »L« »M« »N« »O« »P« »Q« »R« »S« »T« »U« »V« »W« »X« »Y« »Z«`,
      `«A» «B» «C» «D» «E» «F» «G» «H» «I» «J» «K» «L» «M» «N» «O» «P» «Q» «R» «S» «T» «U» «V» «W» «X» «Y» «Z»`,
      `"A" "B" "C" "D" "E" "F" "G" "H" "I" "J" "K" "L" "M" "N" "O" "P" "Q" "R" "S" "T" "U" "V" "W" "X" "Y" "Z"`,
      `OH'A OH'B OH'C OH'D OH'E OH'F OH'G OH'H OH'I OH'J OH'K OH'L OH'M OH'N OH'O OH'P OH'Q OH'R OH'S OH'T OH'U OH'V OH'W OH'X OH'Y OH'Z`,
      `HA'H HB'H HC'H HD'H HE'H HF'H HG'H HH'H HI'H HJ'H HK'H HL'H HM'N OH'H HO'H HP'H HQ'H HR'H HS'H HT'H HU'H HV'H HW'H HX'H HY'H HZ'H`,
      `!A!B!C!D!E!F!G!H!I!J!K!L!M!N!O!P!Q!R!S!T!U!V!W!X!Y!Z!`,
      `¡A ¡B ¡C ¡D ¡E ¡F ¡G ¡H ¡I ¡J ¡K ¡L ¡M ¡N ¡O ¡P ¡Q ¡R ¡S ¡T ¡U ¡V ¡W ¡X ¡Y ¡Z`,
      `¡A ¡B ¡C ¡D ¡E ¡F ¡G ¡H ¡I ¡J ¡K ¡L ¡M ¡N ¡O ¡P ¡Q ¡R ¡S ¡T ¡U ¡V ¡W ¡X ¡Y ¡Z`,
      `?A?B?C?D?E?F?G?H?I?J?K?L?M?N?O?P?Q?R?S?T?U?V?W?X?Y?Z?`,
      `¿A ¿B ¿C ¿D ¿E ¿F ¿G ¿H ¿I ¿J ¿K ¿L ¿M ¿N ¿O ¿P ¿Q ¿R ¿S ¿T ¿U ¿V ¿W ¿X ¿Y ¿Z`,
      `¿A ¿B ¿C ¿D ¿E ¿F ¿G ¿H ¿I ¿J ¿K ¿L ¿M ¿N ¿O ¿P ¿Q ¿R ¿S ¿T ¿U ¿V ¿W ¿X ¿Y ¿Z`,
      `@A@B@C@D@E@F@G@H@I@J@K@L@M@N@O@P@Q@R@S@T@U@V@W@X@Y@Z@`,
      `@A@B@C@D@E@F@G@H@I@J@K@L@M@N@O@P@Q@R@S@T@U@V@W@X@Y@Z@`,
      `*A*B*C*D*E*F*G*H*I*J*K*L*M*N*O*P*Q*R*S*T*U*V*W*X*Y*Z*`,
      `°A°B°C°D°E°F°G°H°I°J°K°L°M°N°O°P°Q°R°S°T°U°V°W°X°Y°Z°`,
      `"A"B"C"D"E"F"G"H"I"J"K"L"M"N"O"P"Q"R"S"T"U"V"W"X"Y"Z"`,
      `™A™B™C™D™E™F™G™H™I™J™K™L™M™N™O™P™Q™R™S™T™U™V™W™X™Y™Z™`,
      `[A] [B] [C] [D] [E] [F] [G] [H] [I] [J] [K] [L] [M] [N] [O] [P] [Q] [R] [S] [T] [U] [V] [W] [X] [Y] [Z]`,
      `(A) (B) (C) (D) (E) (F) (G) (H) (I) (J) (K) (L) (M) (N) (O) (P) (Q) (R) (S) (T) (U) (V) (W) (X) (Y) (Z)`,
      `{A} {B} {C} {D} {E} {F} {G} {H} {I} {J} {K} {L} {M} {N} {O} {P} {Q} {R} {S} {T} {U} {V} {W} {X} {Y} {Z}`,
      `[A] [B] [C] [D] [E] [F] [G] [H] [I] [J] [K] [L] [M] [N] [O] [P] [Q] [R] [S] [T] [U] [V] [W] [X] [Y] [Z]`,
      `(A) (B) (C) (D) (E) (F) (G) (H) (I) (J) (K) (L) (M) (N) (O) (P) (Q) (R) (S) (T) (U) (V) (W) (X) (Y) (Z)`,
      `{A} {B} {C} {D} {E} {F} {G} {H} {I} {J} {K} {L} {M} {N} {O} {P} {Q} {R} {S} {T} {U} {V} {W} {X} {Y} {Z}`,
      `№1№2№3№4№5№6№7№8№9№0№`,
      `%1%2%3%4%5%6%7%8%9%0%`,
      `#1#2#3#4#5#6#7#8#9#0#`,
      `|1|2|3|4|5|6|7|8|9|0|`,
      `.1.2.3.4.5.6.7.8.9.0.`,
      `,1,2,3,4,5,6,7,8,9,0,`,
      `:1:2:3:4:5:6:7:8:9:0:`,
      `;1;2;3;4;5;6;7;8;9;0;`,
      `•1•2•3•4•5•6•7•8•9•0•`,
      `-1-2-3-4-5-6-7-8-9-0-`,
      `—1—2—3—4—5—6—7—8—9—0—`,
      `/1/2/3/4/5/6/7/8/9/0/`,
      `\\1\\2\\3\\4\\5\\6\\7\\8\\9\\0\\`,
      `"1" "2" "3" "4" "5" "6" "7" "8" "9" "0"`,
      `"1"2"3"4"5"6"7"8"9"0"`,
      `"1"2"3"4"5"6"7"8"9"0"`,
      `!1!2!3!4!5!6!7!8!9!0!`,
      `¡1 ¡2 ¡3 ¡4 ¡5 ¡6 ¡7 ¡8 ¡9 ¡0`,
      `?1?2?3?4?5?6?7?8?9?0?`,
      `¿1 ¿2 ¿3 ¿4 ¿5 ¿6 ¿7 ¿8 ¿9 ¿0`,
      `@1@2@3@4@5@6@7@8@9@0@`,
      `*1*2*3*4*5*6*7*8*9*0*`,
      `°1°2°3°4°5°6°7°8°9°0°`,
      `"1"2"3"4"5"6"7"8"9"0"`,
      `[1] [2] [3] [4] [5] [6] [7] [8] [9] [0]`,
      `(1) (2) (3) (4) (5) (6) (7) (8) (9) (0)`,
      `{1} {2} {3} {4} {5} {6} {7} {8} {9} {0}`,
      `$1$2$3$4$5$6$7$8$9$0$`,
      `¢1¢2¢3¢4¢5¢6¢7¢8¢9¢0¢`,
      `ƒ1ƒ2ƒ3ƒ4ƒ5ƒ6ƒ7ƒ8ƒ9ƒ0ƒ`,
      `£1£2£3£4£5£6£7£8£9£0£`,
      `€1€2€3€4€5€6€7€8€9€0€`,
      `¥1¥2¥3¥4¥5¥6¥7¥8¥9¥0¥`,
      `§1§2§3§4§5§6§7§8§9§0§`,
      `¶1¶2¶3¶4¶5¶6¶7¶8¶9¶0¶`,
      `+1+2+3+4+5+6+7+8+9+0+`,
      `<1<2<3<4<5<6<7<8<9<0<`,
      `>1>2>3>4>5>6>7>8>9>0>`,
      `«1» «2» «3» «4» «5» «6» «7» «8» «9» «0»`,
      `»1« »2« »3« »4« »5« »6« »7« »8« »9« »0«`,
      `ª1ª2ª3ª4ª5ª6ª7ª8ª9ª0ª`,
      `º1º2º3º4º5º6º7º8º9º0º`,
      `™1™2™3™4™5™6™7™8™9™0™`,
    ]},
    {hdr:'16/32pt  UC-LC words',fs:16,lh:32,lines:[
      `Aardvark Ablution Acrimonious Adventures Aeolian Africa Agamemnon Ahoy Aileron Ajax Akimbo Altruism America Anecdote Aorta Aptitude Aquarium Arcade Aspartame Attrition Aurelius Avuncular Awning Axminster Ayers Azure Banishment Benighted Bhagavad Biblical Bjorn Blancmange Bolton Brusque Burnish Bwana Byzantium Cabbala Cetacean Charlemagne Cicero Clamorous Cnidarian Conifer Crustacean Ctenoid Culled Cynosure Czarina Dalmatian Delphi Dhurrie Dinner Djinn Document Drill Dunleary Dvorak Dwindle Dynamo Eames Ebullient Echo Edify Eels Eftsoons Egress Ehrlich Eindhoven Eject Ekistics Elzevir Eminence Ennoble Eocene Ephemeral Equator Erstwhile Estienne Etiquette Eucalyptus Everyman Ewen Exeter Eyelet Ezekiel Fanfare Ferocious Ffestiniog Finicky Fjord Flanders Forestry Frills Furniture Fylfot Garrulous Generous Ghastly Gimlet Glorious Gnomon Golfer Grizzled Gumption Gwendolyn Gymkhana Harrow Heifer Hindemith Horace Hsi Hubris Hybrid Iambic Ibarra Ichthyology Identity Ievgeny Ifrit Ignite Ihre Ikon Iliad Imminent Innovation Iolanthe Ipanema Irascible Island Italic Ivory Iwis Ixtapa Iyar Izzard Janacek Jenson Jitter Joinery Jr. Jungian Kaiser Kenilworth Khaki Kindred Klondike Knowledge Kohlrabi Kraken Kudzu Kvetch Kwacha Kyrie Labrador Lent Lhasa Liniment Llama Longboat Luddite Lyceum Mandarin Mbandaka Mcintyre Mdina Mendacious Mfg. Mg Millinery Mlle. Mme. Mnemonic Moribund Mr. Ms. Mtn. Munitions Myra Narragansett Nefarious Nguyen Nile Nkoso Nnenna Nonsense Nr. Nunnery Nyack Oarsman Oblate Ocular Odessa Oedipus Often Ogre Ohms Oilers Okra Olfactory Ominous Onerous Oogamous Opine Ornate Ossified Othello Oubliette Ovens Owlish Oxen Oyster Ozymandias Parisian Pb Pd. Penrose Pfennig Pg. Pharmacy Pirouette Pleistocene Pneumatic Porridge Pp. Principle Psaltery Ptarmigan Pundit Pyrrhic Qaid Qed Qibris Qom Quill Ransom Rb. Rd. Renfield Rheumatic Ringlet Rm. Ronsard Rp. Rte. Runcible Rwanda Rye Salacious Sbeitla Scherzo Serpentine Sforza Shackles Sinful Sjoerd Skull Slalom Smelting Snipe Sorbonne Spartan Squire Sri Stultified Summoner Svelte Swarthy Sykes Szentendre Tarragon Tblisi Tcherny Tennyson Thaumaturge Tincture Tlaloc Toreador Treacherous Tsunami Turkey Twine Tyrolean Tzara Ubiquitous Ucello Udder Ufology Ugric Uhlan Uitlander Ukulele Ulster Umber Unguent Uomo Uplift Ursine Usurious Utrecht Uvula Uxorious Uzbek Vanished Vd. Venomous Vindicate Voracious Vrillier Vs. Vt. Vulnerable Vying Washington Wendell Wharf Window Wm. Worth Wrung Wt. Wunderman Wyes Xanthan Xenon Xiao Xmas Xray Xuxa Xylem Yarrow Ybarra Ycair Yds. Yellowstone Yggdrasil Yin Ylang Yours Ypsilanti Yquem Yrs. Ys. Ytterbium Yunnan Yvonne Zanzibar Zero Zhora Zinfandel Zone Zuni Zwieback Zygote`,
    ]},
    {hdr:'English language text',subs:[
      {label:'7pt',fs:7,lh:7,lines:[`ON THE ENDS OF GOOD AND EVIL BY THE ROMAN ORATOR, POLITICIAN AND PHILOSOPHER MARCUS TULLIUS CICERO FOR ZANY QUALITY KILOWATT JUX. But I must explain to you how all this mistaken idea of denouncing of a pleasure and praising pain was born and I will give you a complete account of the system, and expound the actual teachings of 2014 the great explorer of the truth, the master-builder of human happiness. No one rejects, 'dislikes,' or avoids pleasure itself, because it is pleasure, but because those who do not know how to pursue pleasure and/or rationally encounter consequences that are extremely painful. Nor again—is there anyone 1967 who loves or pursues or desires $5,238 to obtain pain of itself, because it is pain, but occasionally circumstances occur in which toil and (pain can procure) him some great pleasure. Quality means to take a trivial example, "which" of us ever undertakes laborious physical exercise, except to obtain some advantage from it! But who H&M has any right to find fault with a man 9–5 who chooses to enjoy a pleasure that has no annoying consequences, or one who avoids a pain that produces no resultant pleasure? Wilwright Electrical Co.`]},
      {label:'8pt',fs:8,lh:8,lines:[`ON THE ENDS OF GOOD AND EVIL BY THE ROMAN ORATOR, POLITICIAN AND PHILOSOPHER MARCUS TULLIUS CICERO FOR ZANY QUALITY KILOWATT JUX. But I must explain to you how all this mistaken idea of denouncing of a pleasure and praising pain was born and I will give you a complete account of the system, and expound the actual teachings of 2014 the great explorer of the truth, the master-builder of human happiness. No one rejects, 'dislikes,' or avoids pleasure itself, because it is pleasure, but because those who do not know how to pursue pleasure and/or rationally encounter consequences that are extremely painful. Nor again—is there anyone 1967 who loves or pursues or desires $5,238 to obtain pain of itself, because it is pain, but occasionally circumstances occur in which toil and (pain can procure) him some great pleasure. Quality means to take a trivial example, "which" of us ever undertakes laborious physical exercise, except to obtain some advantage from it! But who H&M has any right to find fault with a man 9–5 who chooses to enjoy a pleasure that has no annoying consequences, or one who avoids a pain that produces no resultant pleasure? Wilwright Electrical Co.`]},
      {label:'9pt',fs:9,lh:9,lines:[`ON THE ENDS OF GOOD AND EVIL BY THE ROMAN ORATOR, POLITICIAN AND PHILOSOPHER MARCUS TULLIUS CICERO FOR ZANY QUALITY KILOWATT JUX. But I must explain to you how all this mistaken idea of denouncing of a pleasure and praising pain was born and I will give you a complete account of the system, and expound the actual teachings of 2014 the great explorer of the truth, the master-builder of human happiness. No one rejects, 'dislikes,' or avoids pleasure itself, because it is pleasure, but because those who do not know how to pursue pleasure and/or rationally encounter consequences that are extremely painful. Nor again—is there anyone 1967 who loves or pursues or desires $5,238 to obtain pain of itself, because it is pain, but occasionally circumstances occur in which toil and (pain can procure) him some great pleasure. Quality means to take a trivial example, "which" of us ever undertakes laborious physical exercise, except to obtain some advantage from it! But who H&M has any right to find fault with a man 9–5 who chooses to enjoy a pleasure that has no annoying consequences, or one who avoids a pain that produces no resultant pleasure? Wilwright Electrical Co.`]},
      {label:'10pt',fs:10,lh:10,lines:[`ON THE ENDS OF GOOD AND EVIL BY THE ROMAN ORATOR, POLITICIAN AND PHILOSOPHER MARCUS TULLIUS CICERO FOR ZANY QUALITY KILOWATT JUX. But I must explain to you how all this mistaken* idea of denouncing of a pleasure and praising pain was born and I will give you a complete account of the system, and expound the actual teachings of 2014 the great explorer of the DMS Lat: 40° 46' 36.0336'' N truth, the master-builder of human happiness. No one rejects, 'dislikes,' or avoids pleasure itself, because it is pleasure, but because those who do not know how to pursue pleasure and/or rationally encounter consequences that are extremely painful. Nor again—is there anyone 1967 who loves or pursues or desires $5,238 to obtain pain of itself, because it is pain, but occasionally circumstances occur in which toil and (pain can procure) him some great pleasure. Quality means to take a trivial example, "which" of us ever undertakes laborious physical exercise, except to obtain some advantage from it! But who H&M has any right to find fault with a man 9–5 who chooses to enjoy a pleasure that has no annoying consequences, or one who avoids a pain that produces no resultant pleasure? Wilwright Electrical Co.`]},
      {label:'12pt',fs:12,lh:12,lines:[`ON THE ENDS OF GOOD AND EVIL BY THE ROMAN ORATOR, POLITICIAN AND PHILOSOPHER MARCUS TULLIUS CICERO FOR ZANY QUALITY KILOWATT JUX. But I must explain to you how all this mistaken* idea of denouncing of a pleasure and praising pain was born and I will give you a complete account of the system, and expound the actual teachings of 2014 the great explorer of the DMS Lat: 40° 46' 36.0336'' N truth, the master-builder of human happiness. No one rejects, 'dislikes,' or avoids pleasure itself, because it is pleasure, but because those who do not know how to pursue pleasure and/or rationally encounter consequences that are extremely painful. Nor again—is there anyone 1967 who loves or pursues or desires $5,238 to obtain pain of itself, because it is pain, but occasionally circumstances occur in which toil and (pain can procure) him some great pleasure. Quality means to take a trivial example, "which" of us ever undertakes laborious physical exercise, except to obtain some advantage from it! But who H&M has any right to find fault with a man 9–5 who chooses to enjoy a pleasure that has no annoying consequences, or one who avoids a pain that produces no resultant pleasure? Wilwright Electrical Co.`]},
      {label:'14pt',fs:14,lh:14,lines:[`ON THE ENDS OF GOOD AND EVIL BY THE ROMAN ORATOR, POLITICIAN AND PHILOSOPHER MARCUS TULLIUS CICERO FOR ZANY QUALITY KILOWATT JUX. But I must explain to you how all this mistaken* idea of denouncing of a pleasure and praising pain was born and I will give you a complete account of the system, and expound the actual teachings of 2014 the great explorer of the DMS Lat: 40° 46' 36.0336'' N truth, the master-builder of human happiness. No one rejects, 'dislikes,' or avoids pleasure itself, because it is pleasure, but because those who do not know how to pursue pleasure and/or rationally encounter consequences that are extremely painful. Nor again—is there anyone 1967 who loves or pursues or desires $5,238 to obtain pain of itself, because it is pain, but occasionally circumstances occur in which toil and (pain can procure) him some great pleasure. Quality means to take a trivial example, "which" of us ever undertakes laborious physical exercise, except to obtain some advantage from it! But who H&M has any right to find fault with a man 9–5 who chooses to enjoy a pleasure that has no annoying consequences, or one who avoids a pain that produces no resultant pleasure? Wilwright Electrical Co.`]},
      {label:'16pt',fs:16,lh:16,lines:[`ON THE ENDS OF GOOD AND EVIL BY THE ROMAN ORATOR, POLITICIAN AND PHILOSOPHER MARCUS TULLIUS CICERO FOR ZANY QUALITY KILOWATT JUX. But I must explain to you how all this mistaken* idea of denouncing of a pleasure and praising pain was born and I will give you a complete account of the system, and expound the actual teachings of 2014 the great explorer of the DMS Lat: 40° 46' 36.0336'' N truth, the master-builder of human happiness. No one rejects, 'dislikes,' or avoids pleasure itself, because it is pleasure, but because those who do not know how to pursue pleasure and/or rationally encounter consequences that are extremely painful. Nor again—is there anyone 1967 who loves or pursues or desires $5,238 to obtain pain of itself, because it is pain, but occasionally circumstances occur in which toil and (pain can procure) him some great pleasure. Quality means to take a trivial example, "which" of us ever undertakes laborious physical exercise, except to obtain some advantage from it! But who H&M has any right to find fault with a man 9–5 who chooses to enjoy a pleasure that has no annoying consequences, or one who avoids a pain that produces no resultant pleasure? Wilwright Electrical Co.`]},
    ]},
    {hdr:'9pt  multilanguage text proof',subs:[
      {label:'Hungarian',fs:9,lh:9,lines:[`A zene a hangok és a csend érzelmeket kiváltó elrendezése, létezésének lényege az idő. A pontos meghatározás nem könnyű, de abban általában egyetértés mutatkozik, hogy a zene a hangok tudatosan elrendezett folyamata. A zene egy művészi kifejezési forma, a hangok és „nem-hangok" (csendek) időbeni váltakozásának többnyire tudatosan előállított sorrendje, mely nem utasít konkrét cselekvésre, viszont érzelmeket, indulatokat kelt és gondolatokat ébreszt. Az olyan hangkombinációkat, amelyek ugyan tudatosan jönnek létre, de konkrét üzenetük van (vagyis valamilyen cselekvésre ösztönöznek), általában nem nevezzük zenének. Kizárólagos céljuk a figyelem felkeltése (autóduda, dallamkürtök, szirénák, telefon, ébresztőóra, tömegközlekedés felhívó hangjelzései, rádióadók szignáljai, áruhoz kapcsolt dallamok, templomi harang, egykoron a vadászok vagy a katonák kürtjelei`]},
      {label:'Polish',fs:9,lh:9,lines:[`Muzyka – sztuka organizacji struktur dźwiękowych w czasie. Jedna z dziedzin sztuk pięknych, która wpływa na psychikę człowieka przez dźwięki. Struktury dźwiękowe składają się z zestawów fal akustycznych o celowo dobranych częstotliwościach i amplitudach oraz ciszy pomiędzy nimi. Jednym z celów muzyki jest samoekspresja oraz przekaz subiektywnych odczuć kompozytora lub wykonawcy, który ma wpływ na odczucia, reakcje i świadomość słuchacza przetwarzającego te doznania w sposób zupełnie indywidualny. Od mowy ludzkiej różni się znacznie większą abstrakcyjnością przekazywanych treści oraz wykorzystaniem, oprócz głosu ludzkiego, instrumentów muzycznych oraz wszelkich dźwięków elektronicznych, naturalnych i nieartykułowalnych. Muzyka jest jednym z przejawów ludzkiej kultury. Można przyjąć, że muzyka od zawsze towarzyszyła człowiekowi w`]},
      {label:'Turkish',fs:9,lh:9,lines:[`Macarca (kendi dilinde Bu ses hakkındamagyar nyelv (yardım·bilgi)), Ural dil ailesi içinde yer alan ve muhtemelen Ugor dilleri koluna ait, başlıca Macaristan ve çevresindeki ülkelerde konuşulan bir dildir. Dilin yaklaşık 14.5 milyon konuşanı vardır ve bunların 10 milyonu Macaristan'da yaşar. En büyük ikinci topluluk, 1.5 milyon konuşanı ile komşu Romanya'daki Transilvanya bölgesindedir. Macarca Ural dil ailesine mensuptur. Bu aile içerisinde ise Batı Sibirya ile Kuzey Norveç arasında yaşayan kavimlerin konuştukları Fin- Ugor dilleri grubunda yer alır. Lapça, Fince, Estonca, Mordvince, Çeremisçe, Züryence, Votyakça, Vogulca, Ostyakça da bu dil ailesi içinde yer almaktadır. Buna rağmen Fin-Ugor dillerinin gerçek bir Ural dil ailesi alt grubu olup olmadığı tartışmalıdır.[2] Fin-Ugor dilleri içerisinde, Macarca, Hantıca ve Mansice Ugor dillerini oluşturur ve aile içinde birbirlerine en yakın akrabalık ilişkisini gösterirler.`]},
      {label:'Slovak',fs:9,lh:9,lines:[`Hudba sa vo všeobecnosti definuje ako špecifická ľudská aktivita, ktorá sa pomocou v priestore a čase charakteristicky zoskupených tónov a zvukov a na základe spoločenských skúseností usiluje o (hlavne estetickú) komunikáciu. Hudba je konkrétnejší druh umenia, ktorého výrazovými prostriedkami sú tóny a základnými komponentmi harmónia, melódia, rytmus a farba. Podľa Cassiodora je hudba matematická veda. Slovenská populárna hudba, v zmysle pop music, sa začala rozvíjať v tridsiatych rokoch dvadsiateho storočia. Každé obdobie je charakteristické nástupom rôznych generácii či už hudobníkov, skladateľov, alebo textárov. Hudobná veda je veda o hudbe, teda o celkovej aktivite ľudskej spoločnosti v oblasti hudobného prejavu. Zvuk je každé pozdĺžne mechanické vlnenie v látkovom prostredí, ktoré je schopné vyvolať v ľudskom uchu sluchový vnem. Frekvencia tohto vlnenia leží približne v rozsahu 16 Hz až 20`]},
      {label:'Icelandic',fs:9,lh:9,lines:[`Tónlist sem upplifun: Önnur algeng skilgreining tónlistar heldur því fram að tónlist verði að vera falleg eða melódísk. Þessi skilgreining hefur verið notuð til þess að halda því fram að sumar tegundir raðaðra hljóðruna séu ekki tónlist, en að aðrar séu það. Vegna þess hversu misjafn smekkur fólks á tónlist er milli menningarsvæða og tímabilia er þessi skoðun neydd til þess að taka upp ögn breiðari sjónarmið, þar sem að sagt er að tónlist þróist með tíma og þjóðfélagi. Þessi skilgreining var öllum öðrum algengari á 18. öld, en á því tímabili hélt Mozart því meðal annars fram að „Tónlist má aldrei gleyma sér, og má aldrei hætta að vera tónlist." Tónlist sem flokkur skynjunar: Sjaldgæfari þykir hin skynjunarlega skilgreining tónlistar, þar sem því er haldið fram að tónlist sé ekki eingöngu hljóð, eða skynjun hljóða, heldur aðferð sem að skynjanir, aðgerðir og minningar raðast eftir. Þessi skilgreining hefur haft töluverð áhrif á`]},
      {label:'Romanian',fs:9,lh:9,lines:[`Muzica (din gr. mousikē) este arta combinării notelor în succesiune și simultan într-o formă plăcută estetic, organizarea ritmică a acestor note și integrarea lor într-o lucrare completă. Instrumentele muzicale sunt utilizate în interpretarea compozițiilor muzicale și sunt de obicei clasificate în patru mari grupe tradiționale: cu coarde, suflători din lemn, suflători din alamă și instrumente de percuție, la care se adaugă suflători cu structură complexă și instrumentele electronice. Acestea se folosesc pentru a crea muzica, fiind făcute din plastic, sârma, pânza etc. Există numeroase clasificări ale genurilor muzicale: vocal și instrumental, sacru și laic, cult și comercial („de consum"), rock, de origine afro-americană, muzică electronică etc. Antichitate: s-au păstrat puține exemple de compoziții. Acestea sunt bazate pe moduri. Instrumentele reprezentative ale Greciei Antice sunt lira (cu care este reprezentat`]},
      {label:'Maltese',fs:9,lh:9,lines:[`Żgur li kull wieħed u waħda minna, matul ilġurnata jisma' biċċa mużika. Il-mużika hija ħaġa li l-bniedem ma jistax jgħix mingħajrha. F'kull ġurnata, minn fuq il-mezzi tax-xandir tisma' l-mużika ta' għamla differenti, dik klassika, dik romantika, dik moderna u ta' tipi oħra. Madwar id-dinja kollha, eluf ta' nies jattendu għal kunċerti minn gruppi, orkestri, baned u għal spettakli kbar mużikali, bħal opri, operetti u balletti, imtellgħa min nies professjonali. Kull ġens u kull razza ħalqu l-mużika tagħhom, il-mużika folkloristika. Kull ġens u razza għandha l-melodiji marbuta magħha. Il-mużika li hi rifless sħiħ ta' l-emozzjoni tal-bniedem hi mezz ta' komunikazzjoni ta' ħsibijiet u idejat. Biss, dan il-fenomenu, li sar hekk integrali mal-ħajja tagħna l-bnedmin, minn fejn kellu l-bidu? L-ewwel mużika li ġiet ispirata f'moħħ ilbniedem, żgur li waslet permezz ta' l-elementi tan-natura: ir-riħ, ir-ragħad, it-tfaqqiegħa tas-`]},
      {label:'Danish',fs:9,lh:9,lines:[`Musik opfattes traditionelt som en sammensætning af toner, der synges eller spilles på et instrument. En tænketank hvilken? USA definerede musik som "mønstre af lyde, der varierer i højde og varighed og som frembringes af følelsesmæssige, sociale, kulturelle og intellektuelle grunde". Den bredeste definition er, at musik er organiserede lydbegivenheder der opfattes æstetisk. Musik kan inddeles i tre hovedgrupper:partiturmusik, det vil sige den nedskrevne musik, populærmusik og den mundtlig overleverede musik som folkeviser, børnesange og skillingsviser. Musik anvendes overalt i verden. Samtlige kulturer har udviklet og brugt musikken til for eksempel dans og fest. Musikken er højst sandsynligt opstået meget tidligt i menneskets historie. Mennesket har dyrket musik i flere tusinde år. I Slovenien er der fundet nogle 53.000 år gamle fløjter af ben, som neandertalere har spillet på.`]},
    ]},
  ];
  let bH='';
  function addBlk(line,fs,lh){bH+='<div class="blk" style="font-size:'+fs+'pt;line-height:'+lh+'pt">'+kH(line)+'<\/div>';}
  for(const sec of S){
    bH+='<div class="sh">'+escH(sec.hdr)+'<\/div>';
    if(sec.subs){for(const sub of sec.subs){bH+='<div class="sj">'+escH(sub.label)+'<\/div>';for(const ln of sub.lines)addBlk(ln,sub.fs,sub.lh);}}
    else{for(const ln of sec.lines)addBlk(ln,sec.fs,sec.lh);}
  }
  const pL=escH(fn)+' • zones='+p.zones+' smooth='+document.getElementById('p-smooth').value+' blur='+p.blur+' round='+p.round+' mingap='+Math.round(p.mingap*100)+'% threshold='+p.threshold+' tracking='+p.tracking+' • baseLc='+p.baselc+' baseUc='+p.baseuc+' • pairs='+nonZero.length.toLocaleString();
  const html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Coupler Testprint<\/title><style>'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'@page{size:A4 landscape;margin:6mm 8mm;}'
    +'@font-face{font-family:TF;src:url("'+fontDataUrl+'");}'
    +'body{font-family:TF,serif;font-kerning:none;font-feature-settings:"kern" 0;color:#000;background:#fff;}'
    +'.pm{font-family:monospace;font-size:5.5pt;color:#999;border-bottom:0.4pt solid #ccc;padding-bottom:2pt;margin-bottom:2pt;line-height:1.4;}'
    +'.pm b{color:#000;}'
    +'.sh{font-family:monospace;font-size:5.5pt;color:#ccc;border-top:0.3pt solid #eee;margin-top:4pt;padding-top:1pt;page-break-before:always;}'
    +'.sj{font-family:monospace;font-size:5pt;color:#ddd;padding-top:1pt;}'
    +'.blk{word-break:break-all;margin:0;padding:0;}'
    +'@media print{body{margin:12mm;}}'
    +'<\/style><\/head><body>'
    +'<div class="pm"><b>Coupler Testprint<\/b> — '+pL+'<\/div>'
    +bH
    +'<\/body><\/html>';
  const w=window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

if(typeof module!=='undefined')module.exports={openTestPage};
