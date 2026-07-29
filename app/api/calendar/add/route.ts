import { NextResponse } from 'next/server';
import { addEventToGoogleCalendar } from '@/services/calendar';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, date, time, description } = body;
    
    // Call the calendar service stub
    const result = await addEventToGoogleCalendar({
      title,
      date,
      time,
      description
    });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error adding to calendar:", error);
    return NextResponse.json({ error: "Failed to add to calendar" }, { status: 500 });
  }
}
