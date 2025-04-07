// src/pages/DashboardPage.tsx

import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar,
  Clock,
  Baby,
  PieChart,
  Activity,
  FilePlus,
  MessageSquare,
  ArrowRight,
  AlertTriangle,
  Heart,
  Stethoscope,
  Salad,
  User,
  Edit,
  Trash2,
  Loader2,
  ListChecks
} from 'lucide-react';
import {
  getUserProfile,
  getUserAppointments,
  deleteAppointment,
  Appointment,
  UserProfile,
  updateAppointment,
} from '@/lib/appwrite';
import { format, isAfter, isBefore, addWeeks } from 'date-fns';
// Correct import paths if necessary (e.g., remove /ui if components are directly under /components)
import AppointmentItem from '@/components/ui/AppointmentItem';
import EditAppointmentModal from '@/components/ui/EditAppointmentModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// --- Helper: User Stats Card ---
const UserStatsCards = ({ user, profile, appointmentsCount }: { user: any; profile: UserProfile | null; appointmentsCount: number }) => {
  const profileCompleteness = profile ? (() => {
    const requiredFields = ['name', 'age', 'gender', 'monthOfConception', 'phoneNumber'];
    // Ensure profile fields exist before accessing them
    const completedFields = requiredFields.filter(field => profile && profile[field as keyof UserProfile]);
    // Avoid division by zero if requiredFields is empty
    return requiredFields.length > 0 ? Math.round((completedFields.length / requiredFields.length) * 100) : 0;
  })() : 0;

  return (
    <Card className="border-momcare-primary/20 mt-4">
      <CardHeader className="bg-momcare-light p-3">
        <CardTitle className="flex items-center text-momcare-primary text-sm font-medium">
          <User className="mr-1.5 h-4 w-4" /> Profile & Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 text-xs">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Profile Complete:</span>
            <span className="font-semibold text-momcare-primary">{profileCompleteness}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Upcoming Appts:</span>
            <span className="font-semibold text-momcare-primary">{appointmentsCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};


// --- Main Dashboard Component ---
const DashboardPage = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuthStore();
  const { toast } = useToast();

  // Edit/Delete state
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingAppointmentId, setDeletingAppointmentId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);

  // --- Data Fetching Logic ---
  const fetchData = useCallback(async () => {
    if (!user || !user.$id) {
      setIsLoading(false); setProfile(null); setUpcomingAppointments([]); return;
    }
    setIsLoading(true);
    try {
      const [profileData, appointmentsData] = await Promise.all([
        getUserProfile(user.$id), getUserAppointments(user.$id)
      ]);
      setProfile(profileData);
      const now = new Date();
      const upcoming = appointmentsData
        .filter(app => {
           try {
             // Directly parse ISO date string from Appwrite
             const appDateTime = new Date(app.date);
             if (isNaN(appDateTime.getTime())) {
                console.error('Filter Error: Invalid base date format:', app.date);
                return false;
             }
             // Parse time string
             const timeParts = app.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
             if (!timeParts) {
                console.error('Filter Error: Invalid time format:', app.time);
                return false;
             }
             let hours = parseInt(timeParts[1], 10); const minutes = parseInt(timeParts[2], 10); const period = timeParts[3].toUpperCase();
             if (period === 'PM' && hours !== 12) hours += 12; else if (period === 'AM' && hours === 12) hours = 0;
             // Set hours/minutes onto the date object (uses local timezone)
             appDateTime.setHours(hours, minutes, 0, 0);
             return isAfter(appDateTime, now) && !app.isCompleted;
           } catch (err) { console.error('Filter Error:', err); return false; }
        })
        .sort((a, b) => {
           try {
             // Consistent parsing for sorting
             const dateTimeA = new Date(a.date); const timePartsA = a.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
             if (!timePartsA || isNaN(dateTimeA.getTime())) return 0;
             let hoursA = parseInt(timePartsA[1], 10); const minutesA = parseInt(timePartsA[2], 10); const periodA = timePartsA[3].toUpperCase();
             if (periodA === 'PM' && hoursA !== 12) hoursA += 12; else if (periodA === 'AM' && hoursA === 12) hoursA = 0;
             dateTimeA.setHours(hoursA, minutesA, 0, 0);

             const dateTimeB = new Date(b.date); const timePartsB = b.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
             if (!timePartsB || isNaN(dateTimeB.getTime())) return 0;
             let hoursB = parseInt(timePartsB[1], 10); const minutesB = parseInt(timePartsB[2], 10); const periodB = timePartsB[3].toUpperCase();
             if (periodB === 'PM' && hoursB !== 12) hoursB += 12; else if (periodB === 'AM' && hoursB === 12) hoursB = 0;
             dateTimeB.setHours(hoursB, minutesB, 0, 0);

             if (isNaN(dateTimeA.getTime()) || isNaN(dateTimeB.getTime())) return 0;
             return dateTimeA.getTime() - dateTimeB.getTime();
           } catch (err) { console.error('Sort Error:', err); return 0; }
        });
      setUpcomingAppointments(upcoming);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast({ title: "Data Load Failed", description: "Could not fetch data.", variant: "destructive" });
      setProfile(null); setUpcomingAppointments([]);
    } finally { setIsLoading(false); }
  }, [user, toast]);

  // Fetch data effect
  useEffect(() => { if (user) { fetchData(); } else { setIsLoading(false); setProfile(null); setUpcomingAppointments([]); } }, [user, fetchData]);

  // --- Edit and Delete Handlers ---
  const handleEdit = (appointment: Appointment) => { setEditingAppointment(appointment); setIsEditModalOpen(true); };
  const handleDeleteClick = (appointmentId: string) => { setAppointmentToDelete(appointmentId); setIsDeleteDialogOpen(true); };
  const confirmDelete = async () => {
    if (!appointmentToDelete) return;
    setDeletingAppointmentId(appointmentToDelete); setIsDeleteDialogOpen(false);
    try {
      await deleteAppointment(appointmentToDelete);
      toast({ title: "Appointment Deleted" });
      fetchData(); // Refresh
    } catch (error) { console.error('Error deleting:', error); toast({ title: "Deletion Failed", variant: "destructive" }); }
    finally { setDeletingAppointmentId(null); setAppointmentToDelete(null); }
  };

  // --- Helper Functions for Pregnancy Info ---
  const calculatePregnancyProgress = useCallback(() => {
    if (!profile?.monthOfConception) return 0;
    try {
        const conceptionDate = new Date(profile.monthOfConception + '-01T00:00:00Z'); // Assume start of month UTC
        if (isNaN(conceptionDate.getTime())) return 0;
        const estimatedDueDate = addWeeks(conceptionDate, 40);
        const today = new Date();
        if (isBefore(today, conceptionDate)) return 0;
        if (isAfter(today, estimatedDueDate)) return 100;
        const totalDuration = estimatedDueDate.getTime() - conceptionDate.getTime();
        const elapsedDuration = today.getTime() - conceptionDate.getTime();
        return totalDuration > 0 ? Math.floor((elapsedDuration / totalDuration) * 100) : 0;
    } catch (e) { console.error("Error calculating pregnancy progress:", e); return 0; }
  }, [profile?.monthOfConception]);

  const getPregnancyInfo = useCallback(() => {
    if (!profile?.monthOfConception) return { trimester: "N/A", week: 0 };
    try {
        const conceptionDate = new Date(profile.monthOfConception + '-01T00:00:00Z');
        if (isNaN(conceptionDate.getTime())) return { trimester: "N/A", week: 0 };
        const today = new Date();
        if (isBefore(today, conceptionDate)) return { trimester: "Pre-conception", week: 0 };
        const msInWeek = 1000 * 60 * 60 * 24 * 7;
        const weeksPassed = Math.floor((today.getTime() - conceptionDate.getTime()) / msInWeek);
        if (weeksPassed > 42) return { trimester: "Post-term", week: weeksPassed };
        let trimester;
        if (weeksPassed < 1) trimester = "Pre-conception";
        else if (weeksPassed < 14) trimester = "First";
        else if (weeksPassed < 28) trimester = "Second";
        else trimester = "Third";
        return { trimester, week: weeksPassed };
    } catch (e) { console.error("Error getting pregnancy info:", e); return { trimester: "Error", week: 0 }; }
  }, [profile?.monthOfConception]);

  const getMilestone = (week: number): string => {
    const milestones: { [key: number]: string } = {
      4: "Baby is the size of a poppy seed.", 8: "Heartbeat may be detectable.", 12: "End of the first trimester.",
      16: "You might start feeling movement (quickening).", 20: "Anatomy scan often performed around now.", 24: "Baby reaches viability milestone.",
      28: "Start of the third trimester.", 32: "Baby practices breathing.", 36: "Baby is considered 'early term'.", 40: "Full term! Due date arrives.",
    };
    if (week <= 0) return "Planning or early stages.";
    if (week > 42) return "Baby may have already arrived!";
    const relevantWeeks = Object.keys(milestones).map(Number).filter(w => w <= week);
    const currentMilestoneWeek = Math.max(...relevantWeeks, 0);
    return currentMilestoneWeek > 0 ? `Around Week ${currentMilestoneWeek}: ${milestones[currentMilestoneWeek]}` : "Early development stages.";
  };

  // *** EXPANDED getHealthTip Function ***
  const getHealthTip = (trimester: string, week: number = 0): string => {
    const tips = {
        nutrition: [
            "Drink 8-10 glasses of water daily to stay hydrated and help prevent constipation & UTIs.",
            "Focus on whole foods: fruits, vegetables, lean proteins (like chicken, fish, beans), and whole grains (like oats, quinoa).",
            "Ensure adequate calcium intake (1000-1300mg/day) from dairy, leafy greens, fortified foods, or supplements for baby's bones.",
            "Iron is crucial (aim for 27mg/day), especially later in pregnancy. Include lean red meat, poultry, beans, lentils, spinach, and fortified cereals.",
            "Omega-3 fatty acids (DHA/EPA) support baby's brain development. Eat safe fish like salmon (2-3 servings/week) or consider algae-based supplements.",
            "Limit processed foods, sugary drinks, excessive caffeine (under 200mg/day - about one 12oz coffee), and artificial sweeteners.",
            "Discuss appropriate weight gain goals with your healthcare provider based on your pre-pregnancy BMI.",
            "Take your prenatal vitamin daily - it fills nutritional gaps, especially for folic acid and iron.",
            "Avoid unpasteurized dairy, deli meats (unless heated steaming hot), raw sprouts, raw seafood/eggs, and high-mercury fish (swordfish, shark, king mackerel).",
            "Listen to your hunger cues, but focus on nutrient-dense choices over 'eating for two' in terms of quantity.",
        ],
        activity: [
            "Aim for 150 minutes of moderate-intensity aerobic activity per week (if approved by your doctor), spread throughout the week.",
            "Walking is excellent – start slow and gradually increase duration and pace.",
            "Swimming and water aerobics are gentle on joints and can relieve swelling and back pain.",
            "Prenatal yoga enhances flexibility, strength, balance, and teaches relaxation techniques useful for labor.",
            "Listen carefully to your body! Avoid overheating, stay hydrated during exercise, and stop immediately if you feel pain, dizziness, shortness of breath, or contractions.",
            "Avoid contact sports, activities with high fall risk (skiing, horseback riding), scuba diving, and exercising at high altitudes if not acclimated.",
            "Avoid lying flat on your back for extended periods after the first trimester, as it can restrict blood flow.",
            "Pelvic floor exercises (Kegels) are vital for supporting pelvic organs, preventing incontinence, and aiding postpartum recovery. Do them daily!",
            "Stationary cycling can be a good low-impact cardio option.",
            "Modify exercises as your body changes; focus on maintaining fitness rather than peak performance.",
        ],
        wellbeing: [
            "Prioritize sleep! Aim for 7-9 hours. Use pillows (between knees, under belly) for support and comfort, especially later in pregnancy.",
            "Manage stress actively: practice deep breathing, meditation, mindfulness, take warm baths, or engage in hobbies you enjoy.",
            "Connect with other expectant parents through classes or support groups for shared experiences and advice.",
            "Communicate openly with your partner, family, and friends about your needs, feelings, and anxieties.",
            "Don't hesitate to discuss mental health. Perinatal anxiety and depression are common; seek professional help if needed.",
            "Take short breaks throughout the day to rest and put your feet up, especially if you stand a lot.",
            "Practice self-compassion. Pregnancy involves huge changes; be kind to yourself.",
            "Stay informed by reading reputable sources, but avoid information overload which can increase anxiety.",
            "Consider journaling to process emotions and track your pregnancy journey.",
            "Plan enjoyable, low-key activities to look forward to.",
        ],
        preparation: [
            "Research and enroll in childbirth education classes (Lamaze, Bradley, hypnobirthing, hospital classes) ideally during the second trimester.",
            "Start thinking about your birth preferences (pain management, support people, environment) and discuss them openly with your provider.",
            "Plan your maternity/paternity leave. Understand your rights, workplace policies, and financial implications.",
            "Begin setting up the nursery space: assemble furniture, wash baby clothes, organize essentials.",
            "Research, choose, and correctly install an infant car seat well before your due date (consider getting it checked by a certified technician).",
            "Pack your hospital/birth center bag (and one for your partner/support person) during the third trimester (around 34-36 weeks).",
            "Learn basic infant care skills: diapering, bathing, swaddling, feeding cues, safe sleep practices.",
            "Consider taking an infant CPR and first aid course.",
            "Discuss postpartum support plans with your partner/family (help with meals, chores, older children).",
            "Choose a pediatrician for your baby and schedule an introductory visit if possible.",
        ],
        specific: {
            preconception: [
                "Start taking a prenatal vitamin with at least 400mcg of folic acid daily, ideally 1-3 months before trying to conceive.",
                "Schedule a pre-conception checkup to discuss health history, medications, vaccinations, and genetic screening options.",
                "Achieve and maintain a healthy weight through a balanced diet and regular exercise.",
                "Stop smoking, drinking alcohol, and using recreational drugs completely. Reduce caffeine intake.",
                "Understand your menstrual cycle and fertile window to optimize timing for conception.",
                "Review any chronic health conditions (diabetes, thyroid issues, etc.) with your doctor to ensure they are well-managed.",
                "Ensure your vaccinations (like MMR, Varicella, Flu, Tdap) are up-to-date.",
            ],
            first: [
                "Folic acid (at least 600mcg/day now) is critical for preventing neural tube defects. Continue your prenatal vitamins diligently.",
                "Manage morning sickness: eat small, frequent meals/snacks (crackers, toast), try ginger or vitamin B6 (ask doctor), avoid strong smells, stay hydrated with sips of water or electrolyte drinks.",
                "Combat fatigue by resting whenever possible, taking short naps, and going to bed earlier.",
                "Be extra vigilant about food safety: avoid raw/undercooked meat/eggs, unpasteurized dairy/juice, deli meats (unless heated), high-mercury fish.",
                "Schedule your first prenatal appointment (usually around 8-12 weeks) to confirm pregnancy, estimate due date, and discuss initial screenings.",
                "Stay hydrated even if nauseous; dehydration can worsen symptoms.",
                "Expect emotional changes; hormonal shifts are significant. Talk to your partner or a trusted friend.",
            ],
            second: [
                "You might feel a welcome energy boost (the 'honeymoon' phase!). Use it for gentle exercise and preparations.",
                "Focus on adequate iron and calcium intake as baby's growth accelerates.",
                "Start feeling baby's movements ('quickening'), usually between 16-25 weeks. Pay attention to patterns once established.",
                "Wear comfortable, supportive shoes and consider a maternity support belt if experiencing back or pelvic pain.",
                "Stay hydrated and watch for signs of UTIs (burning, frequency), which are more common.",
                "Attend your mid-pregnancy anatomy scan ultrasound (usually 18-22 weeks) to check baby's development.",
                "Consider dental checkup; pregnancy hormones can affect gums.",
                "Begin researching childcare options if needed.",
            ],
            third: [
                "Monitor fetal movements daily ('kick counts') as instructed by your provider. Report any significant decrease immediately.",
                "Sleep primarily on your left side to optimize blood flow to the uterus and baby.",
                "Attend prenatal appointments more frequently (every 2 weeks, then weekly). Discuss labor signs and concerns.",
                "Learn the difference between Braxton Hicks contractions (irregular, usually painless) and true labor contractions (regular, intensifying).",
                "Practice relaxation, breathing techniques, and positions for labor comfort.",
                "Finalize your birth plan/preferences and pack your hospital bag.",
                "Expect increased physical discomforts: backache, heartburn, swelling, frequent urination, shortness of breath. Discuss management strategies.",
                "Discuss Group B Strep (GBS) testing (usually around 36-37 weeks).",
                "Prepare for postpartum recovery: gather supplies (pads, pain relief), arrange help.",
            ],
            postterm: [
                "Stay in very close contact with your provider; expect increased monitoring (non-stress tests, ultrasounds).",
                "Continue monitoring fetal movements very carefully and report any changes immediately.",
                "Discuss the risks/benefits of continued waiting versus labor induction with your provider based on your specific situation.",
                "Try to stay relaxed and comfortable. Gentle walking might help, but prioritize rest.",
                "Ensure your hospital bag is ready and transportation is arranged.",
            ]
        }
    };

    const getRandomTip = (category: keyof typeof tips | 'specific', subCategory?: keyof typeof tips.specific): string => {
        let tipArray: string[] = [];
        if (category === 'specific' && subCategory && tips.specific[subCategory]) {
            tipArray = tips.specific[subCategory];
        } else if (category !== 'specific' && tips[category]) {
            tipArray = tips[category];
        }
        if (tipArray.length === 0) return "Consult your healthcare provider for personalized advice.";
        const indexSeed = week > 0 ? week : new Date().getDate();
        const index = indexSeed % tipArray.length;
        return tipArray[index];
    };

    switch (trimester) {
      case "First":
        const firstTriCategory = ['specific', 'nutrition', 'wellbeing'][week % 3] as keyof typeof tips | 'specific';
        return getRandomTip(firstTriCategory, 'first');
      case "Second":
        const secondTriCategory = ['specific', 'activity', 'nutrition', 'preparation'][week % 4] as keyof typeof tips | 'specific';
        return getRandomTip(secondTriCategory, 'second');
      case "Third":
        const thirdTriCategory = ['specific', 'preparation', 'wellbeing', 'activity'][week % 4] as keyof typeof tips | 'specific';
        return getRandomTip(thirdTriCategory, 'third');
      case "Pre-conception": return getRandomTip('specific', 'preconception');
      case "Post-term": return getRandomTip('specific', 'postterm');
      default: // N/A, Error, or unknown
        const defaultCategory = ['nutrition', 'activity', 'wellbeing'][new Date().getDate() % 3] as keyof typeof tips;
        return getRandomTip(defaultCategory);
    }
  };


  // Format date/time for display
  const formatAppointmentDate = (dateString: string, time: string): string => {
    try {
        const dateObj = new Date(dateString); // Directly parse ISO string
        if (isNaN(dateObj.getTime())) throw new Error("Invalid date");
        return `${format(dateObj, 'MMM d, yyyy')} at ${time}`;
    } catch (e) { console.error("Error formatting date:", dateString, e); return `${dateString} at ${time}`; }
  };

  // Calculate derived values
  const pregnancyInfo = getPregnancyInfo();
  const pregnancyProgress = calculatePregnancyProgress();
  const nextAppointment = upcomingAppointments[0] || null;

  // --- JSX Rendering ---
  return (
    <MainLayout requireAuth={true}>
      <div className="dashboard-gradient min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* --- Header --- */}
          <h1 className="text-3xl font-bold text-momcare-primary mb-2">
            {isLoading ? 'Loading Dashboard...' : `Hello, ${profile?.name || user?.name || 'User'}!`}
          </h1>
          <p className="text-gray-600 mb-8">
            Welcome to your MomCare AI dashboard.
          </p>

          {/* --- Loading State Full Page --- */}
          {isLoading && ( <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-momcare-primary" /></div> )}

          {/* --- Content Area (Show when not loading) --- */}
          {!isLoading && (
            <>
              {/* --- Top Row Cards --- */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Pregnancy Journey Card */}
                <Card className="border-momcare-primary/20">
                  <CardHeader className="bg-momcare-light"><CardTitle className="flex items-center text-momcare-primary"><Baby className="mr-2 h-5 w-5" />Pregnancy Journey</CardTitle></CardHeader>
                  <CardContent className="pt-6">
                    {profile?.monthOfConception ? (
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between mb-2 text-sm"><span className="font-medium text-gray-700">Week {pregnancyInfo.week} ({pregnancyInfo.trimester} Trimester)</span><span className="text-momcare-primary font-semibold">{pregnancyProgress}%</span></div>
                          <Progress value={pregnancyProgress} className="h-2 [&>*]:bg-momcare-primary" />
                        </div>
                        <div className="bg-momcare-light p-3 rounded-md text-sm text-gray-700"><p><span className="font-medium">Milestone: </span>{getMilestone(pregnancyInfo.week)}</p></div>
                        <div className="flex items-center text-xs text-gray-600"><PieChart className="h-3.5 w-3.5 mr-1 text-momcare-primary" /><span>{pregnancyInfo.week < 40 && pregnancyInfo.week > 0 ? `Approx. ${40 - pregnancyInfo.week} weeks remaining` : pregnancyInfo.week === 0 ? "Journey beginning!" : "Due date reached or passed!"}</span></div>
                      </div>
                    ) : ( <div className="text-center py-4"><p className="text-gray-500 mb-4 text-sm">Update profile with conception month to track progress.</p><Button asChild variant="outline" size="sm"><a href="/profile">Go to Profile</a></Button></div> )}
                  </CardContent>
                </Card>

                {/* Next Appointment Card */}
                <Card className="border-momcare-primary/20">
                  <CardHeader className="bg-momcare-light"><CardTitle className="flex items-center text-momcare-primary"><Calendar className="mr-2 h-5 w-5" />Next Appointment</CardTitle></CardHeader>
                  <CardContent className="pt-6">
                    {nextAppointment ? (
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3"><div className="h-10 w-10 bg-momcare-primary text-white rounded-full flex items-center justify-center flex-shrink-0"><Calendar className="h-5 w-5" /></div><div><p className="font-medium text-gray-800 text-sm">{formatAppointmentDate(nextAppointment.date, nextAppointment.time)}</p><div className="flex items-center text-xs text-gray-500 mt-1"><Clock className="h-3 w-3 mr-1" /><span>Next up</span></div></div></div>
                        {nextAppointment.notes && (<p className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-200 line-clamp-2"><span className="font-medium">Notes:</span> {nextAppointment.notes}</p>)}
                        <div className="flex justify-end pt-1"><Button asChild size="sm" className="bg-momcare-primary hover:bg-momcare-dark text-xs px-3 py-1 h-auto"><a href="/appointment">Manage All</a></Button></div>
                      </div>
                    ) : ( <div className="text-center py-4"><p className="text-gray-500 mb-4 text-sm">No upcoming appointments scheduled.</p><Button asChild size="sm" className="bg-momcare-primary hover:bg-momcare-dark"><a href="/appointment">Schedule Now</a></Button></div> )}
                  </CardContent>
                </Card>

                {/* Your Health Card */}
                <Card className="border-momcare-primary/20">
                  <CardHeader className="bg-momcare-light"><CardTitle className="flex items-center text-momcare-primary"><Activity className="mr-2 h-5 w-5" />Your Health Summary</CardTitle></CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="bg-momcare-light rounded-md p-3">
                        <h3 className="font-medium text-gray-800 flex items-center mb-1 text-sm"><Heart className="h-4 w-4 mr-1 text-red-500" />Health Tip of the Day</h3>
                        {/* Call the expanded function */}
                        <p className="text-xs text-gray-700">{getHealthTip(pregnancyInfo.trimester, pregnancyInfo.week)}</p>
                      </div>
                      {profile?.preExistingConditions && ( <div className="bg-amber-50 rounded-md p-3"><h3 className="font-medium text-amber-800 flex items-center mb-1 text-sm"><AlertTriangle className="h-4 w-4 mr-1 text-amber-500" />Noted Conditions</h3><p className="text-xs text-amber-700">{profile.preExistingConditions}</p></div> )}
                      <UserStatsCards user={user} profile={profile} appointmentsCount={upcomingAppointments.length} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* --- All Upcoming Appointments List --- */}
              {upcomingAppointments.length > 0 && (
                <Card className="border-momcare-primary/20 mb-6">
                  <CardHeader className="bg-momcare-light"><CardTitle className="flex items-center text-momcare-primary"><ListChecks className="mr-2 h-5 w-5" />All Upcoming Appointments ({upcomingAppointments.length})</CardTitle></CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-0">
                      {upcomingAppointments.map((appointment) => ( <AppointmentItem key={appointment.$id} appointment={appointment} onEdit={handleEdit} onDelete={handleDeleteClick} isDeleting={deletingAppointmentId === appointment.$id} /> ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* --- Recommended Articles & Emergency Access --- */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Recommended Articles Card */}
                <Card className="border-momcare-primary/20 col-span-1 lg:col-span-2">
                  <CardHeader className="bg-momcare-light"><CardTitle className="text-momcare-primary">Helpful Resources</CardTitle></CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <a href="/resources/health-checks" className="block bg-white border rounded-lg p-3 hover:shadow-md transition-shadow"><div className="flex items-center"><div className="flex-shrink-0 w-10 h-10 bg-momcare-primary/10 rounded-full flex items-center justify-center mr-3"><Stethoscope className="h-5 w-5 text-momcare-primary" /></div><div><h3 className="font-medium text-gray-800 text-sm">Health Checks</h3><p className="text-xs text-gray-600 mt-0.5">Key tests during pregnancy</p></div></div></a>
                        <a href="/resources/nutrition" className="block bg-white border rounded-lg p-3 hover:shadow-md transition-shadow"><div className="flex items-center"><div className="flex-shrink-0 w-10 h-10 bg-momcare-secondary/10 rounded-full flex items-center justify-center mr-3"><Salad className="h-5 w-5 text-momcare-secondary" /></div><div><h3 className="font-medium text-gray-800 text-sm">Diet & Nutrition</h3><p className="text-xs text-gray-600 mt-0.5">Eating well for two</p></div></div></a>
                        <a href="/resources/development" className="block bg-white border rounded-lg p-3 hover:shadow-md transition-shadow"><div className="flex items-center"><div className="flex-shrink-0 w-10 h-10 bg-momcare-accent/10 rounded-full flex items-center justify-center mr-3"><Baby className="h-5 w-5 text-momcare-accent" /></div><div><h3 className="font-medium text-gray-800 text-sm">Baby Development</h3><p className="text-xs text-gray-600 mt-0.5">Week-by-week guide</p></div></div></a>
                        <a href="/resources/self-care" className="block bg-white border rounded-lg p-3 hover:shadow-md transition-shadow"><div className="flex items-center"><div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3"><Heart className="h-5 w-5 text-green-600" /></div><div><h3 className="font-medium text-gray-800 text-sm">Self-Care</h3><p className="text-xs text-gray-600 mt-0.5">Taking care of yourself</p></div></div></a>
                      </div>
                      <div className="flex justify-center mt-2"><Button asChild variant="outline" size="sm" className="text-momcare-primary"><a href="/resources" className="flex items-center">Browse All Resources<ArrowRight className="ml-1 h-4 w-4" /></a></Button></div>
                    </div>
                  </CardContent>
                </Card>
                {/* Emergency Access Card */}
                <Card className="border-red-200 border-2">
                  <CardHeader className="bg-red-50"><CardTitle className="flex items-center text-red-600"><AlertTriangle className="mr-2 h-5 w-5" />Emergency Info</CardTitle></CardHeader>
                  <CardContent className="pt-4">
                    <div className="space-y-3"><p className="text-gray-700 text-sm">Quick access for urgent situations.</p><Button asChild className="w-full bg-red-600 hover:bg-red-700 mb-2"><a href="/emergency" className="flex items-center justify-center"><AlertTriangle className="mr-2 h-4 w-4" />View Emergency Details</a></Button><div className="bg-red-50 p-3 rounded-md border border-red-100"><p className="text-sm font-medium text-red-600 mb-1">Key Warning Signs:</p><ul className="text-xs text-red-800 space-y-1"><li className="flex items-start"><AlertTriangle className="h-3 w-3 text-red-500 mr-1.5 flex-shrink-0 mt-0.5" />Severe abdominal pain or cramping</li><li className="flex items-start"><AlertTriangle className="h-3 w-3 text-red-500 mr-1.5 flex-shrink-0 mt-0.5" />Heavy vaginal bleeding</li><li className="flex items-start"><AlertTriangle className="h-3 w-3 text-red-500 mr-1.5 flex-shrink-0 mt-0.5" />Significant decrease in fetal movement</li></ul><p className="text-xs text-red-800 mt-2 font-semibold">If experiencing emergencies, call 102 or your provider immediately.</p></div></div>
                  </CardContent>
                </Card>
              </div>

              {/* --- Quick Links --- */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-momcare-primary/10">
                <h2 className="text-xl font-bold text-momcare-primary mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button asChild variant="outline" className="h-20 flex flex-col justify-center items-center text-center p-2"><a href="/chat"><MessageSquare className="h-5 w-5 mb-1 text-momcare-primary" /><span className="text-xs">Chat with AI</span></a></Button>
                  <Button asChild variant="outline" className="h-20 flex flex-col justify-center items-center text-center p-2"><a href="/appointment"><Calendar className="h-5 w-5 mb-1 text-momcare-primary" /><span className="text-xs">Appointments</span></a></Button>
                  <Button asChild variant="outline" className="h-20 flex flex-col justify-center items-center text-center p-2"><a href="/medicaldocs"><FilePlus className="h-5 w-5 mb-1 text-momcare-primary" /><span className="text-xs">Medical Docs</span></a></Button>
                  <Button asChild variant="outline" className="h-20 flex flex-col justify-center items-center text-center p-2"><a href="/profile"><User className="h-5 w-5 mb-1 text-momcare-primary" /><span className="text-xs">My Profile</span></a></Button>
                </div>
              </div>
            </>
          )} {/* End of !isLoading content */}
        </div> {/* End of max-w-7xl */}
      </div> {/* End of dashboard-gradient */}

      {/* --- Modals and Dialogs --- */}
      <EditAppointmentModal appointment={editingAppointment} isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditingAppointment(null); }} onAppointmentUpdated={fetchData} />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete this appointment? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" disabled={deletingAppointmentId === appointmentToDelete}>
              {deletingAppointmentId === appointmentToDelete ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>) : ("Delete Appointment")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default DashboardPage;