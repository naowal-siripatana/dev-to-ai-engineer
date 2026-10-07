/* Shared quiz-game engine for the daily lessons. Usage: initGame(key, rounds, ranks, takeaway). */
function initGame(K,R,RANKS,TAKE){
var $=function(i){return document.getElementById(K+"-"+i)};
var order,i,score;
function shuffle(a){a=a.slice();for(var k=a.length-1;k>0;k--){var j=Math.floor(Math.random()*(k+1));var t=a[k];a[k]=a[j];a[j]=t}return a}
function start(){order=shuffle(R);i=0;score=0;$("start").hidden=true;$("end").hidden=true;$("round").hidden=false;show()}
function show(){var r=order[i];$("num").textContent="Round "+(i+1)+" / "+order.length;$("score").textContent="Score "+score+" / "+order.length;
var c=$("code");if(r.c){c.textContent=r.c;c.parentNode.hidden=false}else{c.parentNode.hidden=true}
$("q").textContent=r.q;var box=$("opts");box.textContent="";var opts=shuffle(r.o);
opts.forEach(function(o){var b=document.createElement("button");b.type="button";b.textContent=o;b.addEventListener("click",function(){answer(o,b)});box.appendChild(b)});
$("fb").hidden=true;$("next").hidden=true;box.querySelector("button").focus()}
function answer(o,btn){var r=order[i],ok=(o===r.o[r.a]);var bs=$("opts").querySelectorAll("button");for(var k=0;k<bs.length;k++){bs[k].disabled=true}btn.classList.add("pick");if(ok)score++;
var fb=$("fb");fb.className="fb"+(ok?"":" bad");fb.textContent="";
var d=document.createElement("div");var b=document.createElement("b");b.textContent=ok?"Correct. ":"Not quite. ";d.appendChild(b);if(!ok){d.appendChild(document.createTextNode("The answer: "+r.o[r.a]))}fb.appendChild(d);
if(r.out){var l=document.createElement("div");l.textContent="Real output:";fb.appendChild(l);var c=document.createElement("code");c.textContent=r.out;fb.appendChild(c)}
var w=document.createElement("div");w.textContent=r.why;fb.appendChild(w);fb.hidden=false;
$("score").textContent="Score "+score+" / "+order.length;var n=$("next");n.textContent=(i===order.length-1)?"See my result":"Next round";n.hidden=false;n.focus()}
function finish(){$("round").hidden=true;var max=order.length,rank=score>=max-1?RANKS[2]:(score>=max-2?RANKS[1]:RANKS[0]);var best=score;
try{var o=parseInt(localStorage.getItem("best-"+K)||"0",10);if(o>best)best=o;localStorage.setItem("best-"+K,String(best))}catch(e){}
var e=$("end");e.textContent="";var h=document.createElement("h3");h.className="px";h.textContent="You scored "+score+" / "+max+": "+rank;e.appendChild(h);
var p=document.createElement("p");p.textContent=TAKE+" Best score on this device: "+best+" / "+max+".";e.appendChild(p);
var b=document.createElement("button");b.type="button";b.textContent="Play again";b.addEventListener("click",start);e.appendChild(b);e.hidden=false;b.focus()}
$("play").addEventListener("click",start);
$("next").addEventListener("click",function(){if(i===order.length-1){finish()}else{i++;show()}});
}
