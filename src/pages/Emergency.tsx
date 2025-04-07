// src/pages/Emergency.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle, Phone, MapPin, Loader2, Hospital, RefreshCw, Navigation,
  HeartPulse, Siren, SearchX, MapPinned, Info, WifiOff, KeyRound, Ban,
  BriefcaseMedical, ClipboardList, LifeBuoy, Clock
} from 'lucide-react';

// --- Constants ---
const GEOLOCATION_TIMEOUT = 15000;
const GOOGLE_MAPS_SCRIPT_ID = "google-maps-places-script";

// --- Interfaces ---
interface LocationState { lat: number; lng: number; }

// Use the type from @types/google.maps if possible, otherwise define needed fields
// Note: Ensure @types/google.maps is installed for PlaceResult definition
interface HospitalPlace extends google.maps.places.PlaceResult {
    opening_hours?: google.maps.places.PlaceOpeningHours | undefined;
}


// --- State Enum ---
enum LoadingStatus { Idle, Locating, LoadingMaps, SearchingHospitals, Success, LocationError, MapsError, SearchError, NoResults, ConfigError }

// --- Skeleton Component ---
const HospitalSkeleton = () => (
    <Card className="border border-gray-200 shadow-sm rounded-lg overflow-hidden animate-pulse">
      <CardHeader className="p-4">
        <Skeleton className="h-5 w-3/4 mb-1.5 bg-gray-200" />
        <Skeleton className="h-4 w-full bg-gray-200" />
      </CardHeader>
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-5 w-1/4 bg-gray-200" />
        <Skeleton className="h-5 w-1/3 bg-gray-200" />
      </CardContent>
      <CardFooter className="p-4 bg-gray-100 border-t">
        <Skeleton className="h-9 w-32 bg-gray-300" />
      </CardFooter>
    </Card>
  );


// --- Main Emergency Component ---
const Emergency = () => {
  const [currentLocation, setCurrentLocation] = useState<LocationState | null>(null);
  const [hospitals, setHospitals] = useState<google.maps.places.PlaceResult[]>([]);
  const [status, setStatus] = useState<LoadingStatus>(LoadingStatus.Idle);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const isMounted = useRef(true);
  const googleMapsApiKey = import.meta.env.VITE_PUBLIC_GOOGLE_MAPS_API_KEY as string;

  // --- Lifecycle and API Key Check ---
  useEffect(() => {
    isMounted.current = true;
    if (!googleMapsApiKey) {
      console.error("CRITICAL: Google Maps API Key (VITE_PUBLIC_GOOGLE_MAPS_API_KEY) is missing!");
      setErrorMessage("Map service configuration error.");
      setStatus(LoadingStatus.ConfigError);
      toast({ title: "Config Error", description: "Maps API Key missing.", variant: "destructive" });
    } else {
      handleRequestLocation(); // Start location process if key exists
    }
    return () => { isMounted.current = false; }; // Cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once

  // --- Geolocation Handling ---
  const handleRequestLocation = useCallback(() => {
    if (!isMounted.current) return;
    console.log("Requesting location...");
    setStatus(LoadingStatus.Locating);
    setErrorMessage(null);
    setCurrentLocation(null);
    setHospitals([]);

    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");
      setErrorMessage("Geolocation is not supported by your browser.");
      setStatus(LoadingStatus.LocationError);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isMounted.current) return;
        console.log("Location acquired:", position.coords);
        const newLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCurrentLocation(newLocation);
        handleLoadGoogleMaps(); // Load maps now
      },
      (error) => {
        if (!isMounted.current) return;
        console.error("Geolocation error:", error.code, error.message);
        let message = "Unable to retrieve your location.";
        if (error.code === error.PERMISSION_DENIED) message = "Location access denied. Please allow location access and refresh.";
        else if (error.code === error.POSITION_UNAVAILABLE) message = "Location information is currently unavailable.";
        else if (error.code === error.TIMEOUT) message = "Location request timed out. Check connection.";
        setErrorMessage(message);
        setStatus(LoadingStatus.LocationError);
      },
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT, maximumAge: 0 }
    );
  }, [toast]); // Include toast if used inside

  // --- Google Maps Script Loading ---
  const handleLoadGoogleMaps = useCallback(() => {
    if (!isMounted.current || !googleMapsApiKey) return;
    if (window.google?.maps?.places) {
      console.log("Google Maps script & places already available.");
      setStatus(LoadingStatus.SearchingHospitals); return;
    }
    if (document.getElementById(GOOGLE_MAPS_SCRIPT_ID)) {
      console.log("Google Maps script tag exists, assuming it will load.");
      setStatus(LoadingStatus.LoadingMaps); return;
    }
    console.log("Loading Google Maps script...");
    setStatus(LoadingStatus.LoadingMaps); setErrorMessage(null);
    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&loading=async`;
    script.async = true; script.defer = true;
    script.onload = () => {
      if (!isMounted.current) return;
      console.log("Google Maps script loaded.");
      if (window.google?.maps?.places) {
        setStatus(LoadingStatus.SearchingHospitals);
      } else {
        console.error("Places library missing after script load.");
        setErrorMessage("Map service components failed to load.");
        setStatus(LoadingStatus.MapsError);
      }
    };
    script.onerror = (error) => {
      if (!isMounted.current) return;
      console.error("Failed to load Google Maps script:", error);
      setErrorMessage("Failed to load map service.");
      setStatus(LoadingStatus.MapsError);
    };
    document.body.appendChild(script);
  }, [googleMapsApiKey]);

  // --- Google Places Search ---
  const searchNearbyHospitals = useCallback(() => {
     if (!isMounted.current || !currentLocation || status !== LoadingStatus.SearchingHospitals) return;
    console.log("Searching for nearby hospitals at:", currentLocation);
    if (!window.google?.maps?.places) {
      console.error("Places library not available for search.");
      setErrorMessage("Map service not ready. Try refreshing.");
      setStatus(LoadingStatus.MapsError); return;
    }
    const locationLatLng = new google.maps.LatLng(currentLocation.lat, currentLocation.lng);
    const placesService = new google.maps.places.PlacesService(document.createElement("div"));
    const request: google.maps.places.PlaceSearchRequest = {
      location: locationLatLng,
      rankBy: google.maps.places.RankBy.DISTANCE,
      keyword: "hospital emergency room",
    };

    placesService.nearbySearch(request, (results, searchStatus) => {
      if (!isMounted.current) return;
      console.log("Places search status:", searchStatus);
      if (searchStatus === google.maps.places.PlacesServiceStatus.OK && results) {
        const validResults = results.filter(place => place.place_id);
        if (validResults.length > 0) {
          setHospitals(validResults); setStatus(LoadingStatus.Success);
        } else {
          setErrorMessage("No hospitals matching criteria found nearby."); setStatus(LoadingStatus.NoResults); setHospitals([]);
        }
      } else if (searchStatus === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        setErrorMessage("No hospitals with emergency rooms found nearby."); setStatus(LoadingStatus.NoResults); setHospitals([]);
      } else {
        let userMessage = `Failed to find hospitals (${searchStatus}).`;
        if (searchStatus === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) userMessage = "Map service usage limit reached.";
        else if (searchStatus === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) userMessage = "Map service request denied (API Key issue?).";
        setErrorMessage(userMessage); setStatus(LoadingStatus.SearchError); setHospitals([]);
      }
    });
  }, [currentLocation, status]);

  // --- Effect to trigger search ---
  useEffect(() => {
    if (status === LoadingStatus.SearchingHospitals) {
      searchNearbyHospitals();
    }
  }, [status, searchNearbyHospitals]);


  // --- Helper ---
  const generateMapLink = (placeId: string | undefined): string => {
    if (!placeId) return '#';
    return `https://www.google.com/maps/search/?api=1&query_place_id=${placeId}`;
  }

  // --- Render Hospital List Content ---
  const renderHospitalContent = () => {
    switch (status) {
        case LoadingStatus.Idle:
        case LoadingStatus.Locating:
          return ( <div className="flex flex-col items-center justify-center text-center flex-grow py-10"><Loader2 className="h-10 w-10 animate-spin text-momcare-primary mb-4" /><p className="text-gray-600 font-medium">Getting your location...</p><p className="text-sm text-gray-500 mt-1">Please wait or allow location access.</p></div> );
        case LoadingStatus.LoadingMaps:
        case LoadingStatus.SearchingHospitals:
          return ( <div className="space-y-4"><p className="text-center text-gray-600 font-medium mb-4">{status === LoadingStatus.LoadingMaps ? "Loading map services..." : "Finding nearby hospitals..."}</p>{[...Array(3)].map((_, i) => <HospitalSkeleton key={i} />)}</div> );
        case LoadingStatus.LocationError: case LoadingStatus.MapsError: case LoadingStatus.SearchError: case LoadingStatus.ConfigError:
          const ErrorIcon = status === LoadingStatus.LocationError ? Ban : status === LoadingStatus.ConfigError ? KeyRound : WifiOff;
          return ( <div className="flex flex-col items-center justify-center text-center flex-grow py-10 bg-red-50 p-6 rounded-md border border-red-200"><ErrorIcon className="h-10 w-10 text-red-500 mb-4" /><p className="text-red-700 font-semibold mb-2">{status === LoadingStatus.ConfigError ? "Configuration Issue" : "Could Not Load Hospitals"}</p><p className="text-red-600 text-sm mb-4">{errorMessage || "An unexpected error occurred."}</p>{status !== LoadingStatus.ConfigError && (<Button onClick={handleRequestLocation} variant="destructive" size="sm"><RefreshCw className="mr-2 h-4 w-4" /> Try Again</Button>)}</div> );
        case LoadingStatus.NoResults:
          return ( <div className="flex flex-col items-center justify-center text-center flex-grow py-10"><SearchX className="h-12 w-12 text-gray-400 mb-4" /><p className="text-gray-600 font-medium mb-2">No Nearby Hospitals Found</p><p className="text-gray-500 text-sm mb-4">{errorMessage || "We couldn't find hospitals with emergency rooms near your location."}</p><Button onClick={handleRequestLocation} variant="outline" size="sm"><RefreshCw className="mr-2 h-4 w-4" /> Refresh Search</Button></div> );
        case LoadingStatus.Success:
          return (
            <div className="space-y-5">
              <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-800">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="font-medium text-blue-900">Opening Hours Note</AlertTitle>
                  <AlertDescription className="text-xs">"Open Now" status reflects general hours. Emergency Room availability may differ. Please call the hospital directly if possible.</AlertDescription>
              </Alert>
              {hospitals.map((hospital) => (
                <Card key={hospital.place_id} className="border border-gray-200 shadow-sm rounded-lg overflow-hidden transition-shadow hover:shadow-md">
                   <CardHeader className="p-4">
                     <CardTitle className="text-base font-semibold text-momcare-primary">{hospital.name || 'Hospital Name Unavailable'}</CardTitle>
                     {hospital.vicinity && (<CardDescription className="text-xs text-gray-500 mt-0.5 flex items-start"><MapPin className="h-3 w-3 mr-1 flex-shrink-0 mt-px" />{hospital.vicinity}</CardDescription>)}
                   </CardHeader>
                   <CardContent className="p-4 pt-0 flex flex-wrap gap-2 items-center">
                     {hospital.opening_hours?.open_now !== undefined && (
                        <Badge
                            variant={hospital.opening_hours.open_now ? "default" : "destructive"}
                            className={`text-xs font-medium ${hospital.opening_hours.open_now
                                ? 'bg-green-100 text-green-800 border-green-200'
                                : ''
                            }`}
                        >
                           {hospital.opening_hours.open_now ? "Open Now" : "Closed"}
                        </Badge>
                     )}
                     {hospital.rating && (<Badge variant="secondary" className="text-xs font-medium">{hospital.rating.toFixed(1)} ★ Rating</Badge>)}
                   </CardContent>
                   <CardFooter className="p-4 bg-gray-50/70 border-t">
                       <Button asChild size="sm" className="bg-momcare-primary hover:bg-momcare-dark text-white">
                         <a
                           href={generateMapLink(hospital.place_id)}
                           target="_blank"
                           rel="noopener noreferrer"
                           aria-label={`Get directions to ${hospital.name || 'this hospital'}`}
                           onClick={(e) => !hospital.place_id && e.preventDefault()}
                           className={!hospital.place_id ? 'opacity-50 cursor-not-allowed' : ''}
                         >
                           <Navigation className="mr-1.5 h-4 w-4" /> Get Directions
                         </a>
                       </Button>
                   </CardFooter>
                </Card>
              ))}
               <div className="mt-6 flex justify-center border-t pt-5"><Button onClick={handleRequestLocation} variant="outline" size="sm"><RefreshCw className="mr-2 h-4 w-4" /> Refresh Hospital List</Button></div>
            </div>
          );
        default: return <p className="text-center py-10 text-gray-500">Loading state...</p>;
      }
  };

  // --- JSX ---
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12"> {/* Wider layout */}
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-momcare-primary sm:text-5xl tracking-tight">Emergency Support</h1>
          <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">Critical contacts, urgent warning signs, and help finding nearby medical facilities when you need them most.</p>
        </div>

        {/* Emergency Alert */}
        <Alert variant="destructive" className="mb-12 border-2 border-red-600 bg-red-50 p-6 rounded-lg shadow-xl flex items-start">
          <Siren className="h-8 w-8 text-red-600 flex-shrink-0 mt-1" />
          <div className="ml-4">
            <AlertTitle className="text-red-800 font-bold text-2xl">Medical Emergency? Act Immediately!</AlertTitle>
            <AlertDescription className="text-red-700 font-medium mt-2 text-base">
              {/* FIX: Replaced ** with <strong> */}
              This page provides helpful information, but <strong>it is NOT a substitute for emergency services.</strong> If you suspect a medical emergency for yourself or your baby, <strong>call 102 (or your local emergency number) right away.</strong>
            </AlertDescription>
          </div>
        </Alert>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12 items-start">

          {/* Column 1: Contacts & What to Do */}
          <div className="lg:col-span-1 space-y-8">
            {/* Contacts Card */}
            <Card className="border-red-200 border shadow-lg rounded-lg overflow-hidden">
              <CardHeader className="bg-red-50 p-5"><CardTitle className="flex items-center text-xl font-semibold text-red-700"><Phone className="mr-3 h-6 w-6" />Emergency Contacts</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-5">
                 <div className="flex items-center justify-between border-b pb-4">
                    <div><h3 className="font-semibold text-gray-800 text-base">Ambulance / Medical</h3><p className="text-2xl font-bold text-red-600 tracking-wider">102</p></div>
                    <Button asChild variant="destructive" size="sm"><a href="tel:102" aria-label="Call Emergency Services 102"><Phone className="mr-1.5 h-4 w-4" /> Call Now</a></Button>
                 </div>
                 <div className="flex items-center justify-between border-b pb-4">
                    <div><h3 className="font-semibold text-gray-800 text-base">Pregnancy Support</h3><p className="text-lg font-bold text-momcare-primary">0444-631-4300</p><p className="text-xs text-gray-500">(Check local availability)</p></div>
                    <Button asChild variant="outline" size="sm" className="border-momcare-primary text-momcare-primary hover:bg-momcare-light hover:text-momcare-primary"><a href="tel:04446314300" aria-label="Call Pregnancy Support Hotline"><HeartPulse className="mr-1.5 h-4 w-4" /> Call Support</a></Button>
                 </div>
                 <div>
                    <h3 className="font-semibold text-gray-800 text-base">Other Useful Numbers</h3>
                    <p className="text-sm text-gray-500 mt-1">Consider adding local Poison Control or non-emergency police numbers here if relevant.</p>
                 </div>
              </CardContent>
            </Card>

            {/* What to Do Card */}
            <Card className="border-blue-200 border shadow-lg rounded-lg overflow-hidden">
                <CardHeader className="bg-blue-50 p-5"><CardTitle className="flex items-center text-xl font-semibold text-blue-700"><ClipboardList className="mr-3 h-6 w-6" />In Case of Emergency</CardTitle></CardHeader>
                <CardContent className="p-6">
                    <ol className="space-y-3 text-sm list-decimal list-outside pl-5 text-gray-700">
                        {/* FIX: Replaced ** with <strong> */}
                        <li><strong>Stay Calm:</strong> Take deep breaths. Panic can make things worse.</li>
                        <li><strong>Call for Help:</strong> Dial 102 or your local emergency number immediately. Clearly state your emergency.</li>
                        <li><strong>Provide Information:</strong> Tell the operator your location, symptoms, how many weeks pregnant you are, and any known medical conditions.</li>
                        <li><strong>Don't Drive Yourself:</strong> If possible, have someone else drive you or wait for the ambulance.</li>
                        <li><strong>Contact Support:</strong> Notify your partner, family member, or support person.</li>
                        <li><strong>Medical Info:</strong> Have your medical records, ID, and insurance information ready if possible.</li>
                        <li><strong>Follow Instructions:</strong> Listen carefully to the emergency operator and medical personnel.</li>
                    </ol>
                </CardContent>
            </Card>
          </div>

          {/* Column 2: Warning Signs & Preparedness */}
          <div className="lg:col-span-2 space-y-8">
            {/* Warning Signs Card with Accordion */}
            <Card className="border-amber-200 border shadow-lg rounded-lg overflow-hidden">
              <CardHeader className="bg-amber-50 p-5"><CardTitle className="flex items-center text-xl font-semibold text-amber-700"><Info className="mr-3 h-6 w-6" />Urgent Pregnancy Warning Signs</CardTitle><CardDescription className="text-amber-600 text-sm pt-1">Seek immediate medical attention if you experience any of these.</CardDescription></CardHeader>
              <CardContent className="p-6">
                <Accordion type="single" collapsible className="w-full">
                  {/* Preeclampsia Signs */}
                  <AccordionItem value="item-1">
                    <AccordionTrigger className="text-base font-medium hover:no-underline">Signs of Preeclampsia / High Blood Pressure</AccordionTrigger>
                    <AccordionContent className="text-sm space-y-2 pt-2">
                      {/* FIX: Replaced ** with <strong> */}
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Severe Headache:</strong> Persistent, doesn't improve with rest/medication.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Vision Changes:</strong> Blurred vision, seeing spots/flashing lights, sensitivity to light.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Severe Swelling:</strong> Sudden swelling, especially in the face, hands, or feet (more than usual pregnancy swelling).</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Upper Abdominal Pain:</strong> Pain under the ribs, usually on the right side.</span></p>
                      <p className="text-xs text-gray-600 italic mt-1">Why it's urgent: Preeclampsia is a serious condition affecting blood pressure and organs, potentially dangerous for both mother and baby if untreated.</p>
                    </AccordionContent>
                  </AccordionItem>
                  {/* Preterm Labor Signs */}
                  <AccordionItem value="item-2">
                    <AccordionTrigger className="text-base font-medium hover:no-underline">Signs of Preterm Labor (Before 37 Weeks)</AccordionTrigger>
                    <AccordionContent className="text-sm space-y-2 pt-2">
                      {/* FIX: Replaced ** with <strong> */}
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Regular Contractions:</strong> More than 4-6 in an hour, may feel like tightening or period cramps.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Water Breaking:</strong> A gush or continuous trickle of fluid from the vagina.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Pelvic Pressure:</strong> Feeling like the baby is pushing down.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Low, Dull Backache:</strong> Constant or comes and goes.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Change in Vaginal Discharge:</strong> Increase in amount, or becoming watery, mucus-like, or bloody.</span></p>
                      <p className="text-xs text-gray-600 italic mt-1">Why it's urgent: Starting labor too early requires medical intervention to potentially stop it or prepare for an early birth.</p>
                    </AccordionContent>
                  </AccordionItem>
                  {/* Bleeding Signs */}
                   <AccordionItem value="item-3">
                    <AccordionTrigger className="text-base font-medium hover:no-underline">Bleeding Issues</AccordionTrigger>
                    <AccordionContent className="text-sm space-y-2 pt-2">
                       {/* FIX: Replaced ** with <strong> */}
                       <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Heavy Vaginal Bleeding:</strong> Soaking through a pad in an hour, with or without pain.</span></p>
                       <p className="text-xs text-gray-600 italic mt-1">Why it's urgent: Significant bleeding can indicate serious problems like placental abruption or placenta previa.</p>
                    </AccordionContent>
                  </AccordionItem>
                  {/* Other Urgent Signs */}
                  <AccordionItem value="item-4">
                    <AccordionTrigger className="text-base font-medium hover:no-underline">Other Urgent Concerns</AccordionTrigger>
                    <AccordionContent className="text-sm space-y-2 pt-2">
                      {/* FIX: Replaced ** with <strong> */}
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Decreased Fetal Movement:</strong> Significant reduction or absence of baby's kicks/movements (follow doctor's advice on kick counts).</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>High Fever:</strong> Temperature over 100.4°F (38°C) that doesn't come down.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Severe Abdominal Pain:</strong> Intense, persistent pain not relieved by changing position.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Difficulty Breathing / Chest Pain:</strong> Shortness of breath worse than usual pregnancy breathlessness, or any chest pain.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Persistent Vomiting:</strong> Unable to keep fluids down for more than 12-24 hours.</span></p>
                      <p className="flex items-start"><AlertTriangle className="h-4 w-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" /><span><strong>Thoughts of Harming Yourself or Baby:</strong> Seek immediate help from emergency services or a mental health crisis line.</span></p>
                      <p className="text-xs text-gray-600 italic mt-1">Why it's urgent: These signs can indicate infection, fetal distress, dehydration, blood clots, or other serious conditions requiring prompt evaluation.</p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

             {/* Emergency Preparedness Card */}
            <Card className="border-green-200 border shadow-lg rounded-lg overflow-hidden">
                <CardHeader className="bg-green-50 p-5"><CardTitle className="flex items-center text-xl font-semibold text-green-700"><BriefcaseMedical className="mr-3 h-6 w-6" />Emergency Preparedness</CardTitle></CardHeader>
                <CardContent className="p-6 space-y-4">
                    <div>
                        <h3 className="font-semibold text-base text-gray-800 mb-2">Prepare a "Go-Bag":</h3>
                        <ul className="space-y-1.5 text-sm list-disc list-outside pl-5 text-gray-700">
                            <li>Important documents (ID, insurance card, hospital pre-registration forms).</li>
                            <li>Copy of your prenatal records (ask your doctor).</li>
                            <li>List of current medications and allergies.</li>
                            <li>Phone and charger.</li>
                            <li>Comfortable clothes, basic toiletries.</li>
                            <li>Snacks and water (check hospital policy).</li>
                            <li>Eyeglasses/contacts if needed.</li>
                        </ul>
                    </div>
                     <div>
                        <h3 className="font-semibold text-base text-gray-800 mb-2">Keep Information Handy:</h3>
                        <ul className="space-y-1.5 text-sm list-disc list-outside pl-5 text-gray-700">
                            <li>Doctor's and hospital's phone numbers.</li>
                            <li>Emergency contact numbers.</li>
                            <li>Your blood type (if known).</li>
                            <li>Brief medical history summary.</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
          </div>
        </div>

        {/* Nearby Hospitals Card */}
        <Card className="border-gray-200 border shadow-lg rounded-lg overflow-hidden mb-12">
          <CardHeader className="bg-gray-50 p-5 border-b">
            <CardTitle className="flex items-center text-xl font-semibold text-gray-800"><MapPinned className="mr-3 h-6 w-6 text-momcare-primary" />Nearby Hospitals with Emergency Rooms</CardTitle>
            <CardDescription className="mt-1 text-sm text-gray-600">Showing hospitals closest to your current location, based on Google Maps data. Always call 911/102 in a true emergency.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 min-h-[300px] flex flex-col">
            {renderHospitalContent()} {/* Render dynamic content based on status */}
          </CardContent>
        </Card>

        {/* Disclaimer Section */}
         <Card className="border-gray-300 border-dashed bg-gray-50 mb-12">
            <CardHeader className="p-5"><CardTitle className="flex items-center text-lg font-semibold text-gray-700"><LifeBuoy className="mr-3 h-5 w-5" />Important Disclaimer</CardTitle></CardHeader>
            <CardContent className="p-5 pt-0 text-sm text-gray-600 space-y-2">
                {/* FIX: Replaced ** with <strong> */}
                <p>This page provides general information and tools for emergency preparedness during pregnancy. It is <strong>not</strong> a substitute for professional medical advice, diagnosis, or treatment.</p>
                <p>Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition. <strong>Never disregard professional medical advice or delay in seeking it because of something you have read on this application.</strong></p>
                <p>In case of a medical emergency, call your local emergency number (like 102) immediately.</p>
                <p>Hospital information (including opening hours and ratings) is provided by Google Maps and may not always be completely up-to-date or reflect specific Emergency Room availability. Verify critical information directly with the hospital if possible.</p>
            </CardContent>
         </Card>

        {/* Final CTA */}
        <div className="bg-gradient-to-r from-momcare-light to-white rounded-lg p-8 text-center border border-momcare-primary/20 shadow-md">
          <h2 className="text-2xl font-bold text-momcare-primary mb-3">Have Non-Urgent Questions?</h2>
          <p className="mb-6 text-gray-700 max-w-xl mx-auto">Our AI assistant is available 24/7 for general pregnancy information and support. Remember, it's not a substitute for professional medical advice.</p>
          <Button asChild size="lg" className="bg-momcare-primary hover:bg-momcare-dark text-base px-8 py-3"><a href="/chat">Chat with MomCare AI</a></Button>
        </div>
      </div>
    </MainLayout>
  );
};

export default Emergency;