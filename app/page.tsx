import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  Clock3,
  Gift,
  GraduationCap,
  HeartHandshake,
  MoveUpRight,
  Sparkles,
  Star,
  Stethoscope,
  UsersRound,
} from "lucide-react";
import { SessionNav } from "@/components/session-nav";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "MedExplore Wednesday | พุธบ่าย เปิดโลกคลินิก",
  description:
    "กิจกรรมสำหรับนิสิตแพทย์ชั้นปีที่ 1–3 วันพุธบ่าย เดือนละ 1 ครั้ง เวลา 13.30–15.30 น. เรียนรู้จากผู้ป่วย ฝึกทักษะพื้นฐาน และเชื่อมความรู้สู่คลินิก สอนโดยอาจารย์แพทย์ เข้าร่วมโดยสมัครใจ ไม่มีผลต่อคะแนนรายวิชา",
};

const learningExperiences = [
  {
    number: "01",
    icon: UsersRound,
    title: "เรียนรู้จากผู้ป่วย",
    description: "เปิดมุมมองการดูแลผู้คน ผ่านประสบการณ์การเรียนรู้ในโลกคลินิก",
  },
  {
    number: "02",
    icon: Stethoscope,
    title: "ฝึกทักษะพื้นฐาน",
    description: "เริ่มต้นฝึกทักษะพื้นฐานทางการแพทย์ เรียนรู้และฝึกฝนโดยมีอาจารย์แพทย์เป็นผู้สอน",
  },
  {
    number: "03",
    icon: BookOpenCheck,
    title: "เชื่อมความรู้สู่คลินิก",
    description: "ต่อยอดความรู้ในห้องเรียน สู่ความเข้าใจการดูแลผู้ป่วยและบทบาทของแพทย์",
  },
];

const rewardSteps = [
  { icon: CalendarDays, title: "เข้าร่วมกิจกรรม", description: "เลือกเรื่องที่สนใจ" },
  { icon: Star, title: "สะสมดาว", description: "เก็บทุกการมีส่วนร่วม" },
  { icon: Gift, title: "แลกของรางวัล", description: "ปลายปีการศึกษา" },
];

export default function Home() {
  return (
    <div className={styles.home}>
      <a href="#main-content" className={styles.skipLink}>ข้ามไปยังเนื้อหา</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="MedExplore Wednesday หน้าแรก">
            <span className={styles.brandIcon}>
              <Star size={23} fill="currentColor" aria-hidden="true" />
            </span>
            <span>MedExplore<small>Wednesday · พุธบ่าย เปิดโลกคลินิก</small></span>
          </Link>
          <nav className={styles.sectionNav} aria-label="เกี่ยวกับโครงการ">
            <a href="#learning">สิ่งที่จะได้เรียนรู้</a>
            <a href="#collect-stars">สะสมดาวและรางวัล</a>
          </nav>
          <div className={styles.sessionNav}>
            <Suspense fallback={<span className={styles.navLoading} role="status">กำลังโหลด...</span>}>
              <SessionNav />
            </Suspense>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><span /> สำหรับนิสิตแพทย์ ชั้นปีที่ 1–3</span>
            <p className={styles.programName}>MedExplore Wednesday</p>
            <h1 id="hero-title">
              พุธบ่าย<br />เปิดโลก
              <span className={styles.titleAccent}>
                คลินิก
                <svg viewBox="0 0 380 15" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M3 11 Q180 -3 377 8" />
                </svg>
              </span>
            </h1>
            <p className={styles.heroDescription}>
              ค้นพบแรงบันดาลใจในเส้นทางแพทย์ไปด้วยกัน<br className={styles.desktopBreak} />
              เรียนรู้ดูแลผู้คน สร้างอนาคตที่ดีขึ้น
            </p>
            <div className={styles.heroActions}>
              <Link href="/activities" className={styles.primaryButton}>
                เลือกกิจกรรมที่สนใจ <ArrowRight size={19} aria-hidden="true" />
              </Link>
              <a href="#learning" className={styles.textButton}>
                มารู้จักกิจกรรม <ArrowDown size={17} aria-hidden="true" />
              </a>
            </div>
            <ul className={styles.heroNotes} aria-label="เงื่อนไขการเข้าร่วม">
              <li><Check size={15} aria-hidden="true" /> เข้าร่วมโดยสมัครใจ</li>
              <li><Check size={15} aria-hidden="true" /> ไม่มีผลต่อคะแนนรายวิชา</li>
            </ul>
          </div>

          <div className={styles.heroArt} role="img" aria-label="MedExplore Wednesday เรียนรู้จากผู้ป่วย สอนโดยอาจารย์แพทย์ Small Exposure Big Possibilities">
            <div className={styles.artTopline}>
              <span><span /> A WEDNESDAY TO GROW</span>
              <Sparkles size={18} aria-hidden="true" />
            </div>
            <div className={styles.orbitScene} aria-hidden="true">
              <div className={styles.orbitOuter} />
              <div className={styles.orbitInner} />
              <span className={styles.orbitDotOne} />
              <span className={styles.orbitDotTwo} />
              <Star className={styles.tinyStarOne} size={19} />
              <Sparkles className={styles.tinyStarTwo} size={25} />
              <svg className={styles.mainStar} viewBox="0 0 250 260" fill="none">
                <defs>
                  <linearGradient id="home-star-gold" x1="45" y1="25" x2="200" y2="225" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fff2b0" /><stop offset=".48" stopColor="#f4cf6c" /><stop offset="1" stopColor="#c48c34" />
                  </linearGradient>
                  <linearGradient id="home-star-light" x1="73" y1="50" x2="153" y2="180" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fff9d9" /><stop offset="1" stopColor="#f2cd70" />
                  </linearGradient>
                </defs>
                <path d="m125 22 32 66 73 11-52 51 12 74-65-35-65 35 12-74-52-51 73-11Z" fill="#966627" transform="translate(0 9)" />
                <path d="m125 22 32 66 73 11-52 51 12 74-65-35-65 35 12-74-52-51 73-11Z" fill="url(#home-star-gold)" stroke="#ffe7a1" strokeWidth="2" strokeLinejoin="round" />
                <path d="m125 22 0 111-32-45Z" fill="#fff8d8" fillOpacity=".6" />
                <path d="m20 99 105 34-53 17Z" fill="#fff4c1" fillOpacity=".45" />
                <path d="m125 133 65 91-65-35Z" fill="#b88230" fillOpacity=".35" />
                <path d="m125 59 22 47 52 8-37 37 8 52-45-25-45 25 8-52-37-37 52-8Z" fill="url(#home-star-light)" stroke="#dcae50" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="m105 128 14 14 29-30" stroke="#997031" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className={`${styles.floatingLabel} ${styles.joinLabel}`}>
                <span className={styles.yellowIcon}><HeartHandshake size={19} /></span>
                <div>เรียนรู้จากผู้ป่วย<small>เชื่อมความรู้สู่คลินิก</small></div>
                <MoveUpRight size={16} />
              </div>
              <div className={`${styles.floatingLabel} ${styles.helpLabel}`}>
                <span className={styles.greenIcon}><Stethoscope size={19} /></span>
                <div>สอนโดยอาจารย์แพทย์<small>ก้าวเล็ก ๆ สู่เส้นทางแพทย์</small></div>
              </div>
            </div>
            <div className={styles.artCaption}>
              <span>Small Exposure<br /><strong>Big Possibilities</strong></span>
              <span className={styles.captionBadge}><GraduationCap size={16} aria-hidden="true" /> ปี 1–3</span>
            </div>
          </div>
        </section>

        <section className={styles.scheduleSection} aria-label="รายละเอียดกิจกรรม">
          <dl className={styles.schedule}>
            <div>
              <GraduationCap size={26} strokeWidth={1.5} aria-hidden="true" />
              <dt>สำหรับใคร</dt>
              <dd>นิสิตแพทย์ ชั้นปีที่ 1–3</dd>
            </div>
            <div>
              <CalendarDays size={26} strokeWidth={1.5} aria-hidden="true" />
              <dt>นัดกันวันไหน</dt>
              <dd>วันพุธบ่าย เดือนละ 1 ครั้ง</dd>
            </div>
            <div>
              <Clock3 size={26} strokeWidth={1.5} aria-hidden="true" />
              <dt>ช่วงเวลาเรียนรู้</dt>
              <dd>13.30 – 15.30 น.</dd>
            </div>
          </dl>
        </section>

        <section id="learning" className={styles.stepsSection} aria-labelledby="learning-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>SMALL EXPOSURE, BIG POSSIBILITIES</p>
              <h2 id="learning-title">เปิดประสบการณ์ใหม่ ให้ความรู้ใกล้ชีวิตจริง</h2>
            </div>
            <span className={styles.headingNote}>
              <Stethoscope size={17} aria-hidden="true" /> สอนโดยอาจารย์แพทย์
            </span>
          </div>
          <div className={styles.steps}>
            {learningExperiences.map(({ number, icon: Icon, title, description }) => (
              <article key={number} className={styles.step}>
                <div className={styles.stepTop}>
                  <span className={styles.stepIcon}><Icon size={24} strokeWidth={1.6} aria-hidden="true" /></span>
                  <span className={styles.stepNumber}>{number}</span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="collect-stars" className={styles.rewardsSection} aria-labelledby="rewards-title">
          <div className={styles.rewardsCopy}>
            <p className={styles.kicker}>LEARN MORE. SHINE MORE.</p>
            <h2 id="rewards-title">ได้ประสบการณ์<br />ได้ดาว ได้รางวัล</h2>
            <p>เข้าร่วมกิจกรรม สะสมดาว แลกของรางวัลปลายปีการศึกษา</p>
          </div>
          <div className={styles.rewardJourney}>
            <ol className={styles.rewardSteps}>
              {rewardSteps.map(({ icon: Icon, title, description }, index) => (
                <li key={title}>
                  <span className={styles.rewardIcon}><Icon size={26} strokeWidth={1.6} aria-hidden="true" /></span>
                  <span className={styles.rewardNumber}>0{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
            <p className={styles.rewardNote}>การสะสมดาวและแลกของรางวัลเป็นไปตามเงื่อนไขของโครงการ</p>
          </div>
        </section>

        <section id="start-journey" className={styles.cta} aria-labelledby="cta-title">
          <div>
            <p className={styles.ctaKicker}><Sparkles size={17} aria-hidden="true" /> GOOD DOCTORS BRIGHTER TOMORROWS</p>
            <h2 id="cta-title">ก้าวเล็ก ๆ สู่หมอที่ดีกว่าในอนาคต</h2>
            <p>เลือกเรื่องที่สนใจ แล้วมาเรียนรู้ไปด้วยกัน</p>
          </div>
          <Link href="/activities" className={styles.lightButton}>
            ค้นหากิจกรรมของคุณ <ArrowRight size={19} aria-hidden="true" />
          </Link>
          <Star className={styles.ctaStar} size={190} strokeWidth={.6} aria-hidden="true" />
        </section>
      </main>

      <footer className={styles.footer}>
        <span><Star size={16} fill="currentColor" aria-hidden="true" /> MedExplore Wednesday</span>
        <p>Good Doctors Brighter Tomorrows</p>
        <a href="#main-content">กลับขึ้นด้านบน ↑</a>
      </footer>
    </div>
  );
}
