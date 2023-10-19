---
layout: post
title:  "JavaScript Event Delegation"
date:   2015-02-05 10:58:49
categories: code
---

Anyone who has ever been in a technical interview for web development has undoubtedly come across the topic of event delegation. If you don't know what event delegation is, you'll find yourself at the embarrassing intersection of "I feel like a dumbass" and "what are you talking about?". Let's look at some simple javascript code (jQuery) to get a better understanding of what this is.

{% highlight javascript %}
$('#mySelector').click(function(){
    console.log("You clicked mySelector");
});
{% endhighlight %}

In this example, the element with the id of "mySelector" is clicked on and that click event triggers the console.log function to print out the message. This is simple. The html code for this element is this.

{% highlight html %}
<a href="#" id="mySelector">Click me</a>
{% endhighlight %}

Here's where the problems start arising. What if you had a list of elements in your document and you wanted your function to fire whenever <em>any</em> of those elements was clicked?

{% highlight html %}
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
  <li>Item 3</li>
</ul>
{% endhighlight %}

Simple, you might think, let's just add a class to each <li> element and fire off the code whenever the click event occurs on that element. Let's see how this would look.

First, the javascript:

{% highlight javascript %}
$('.mySelector').click(function(){
    console.log("You clicked an item.");
});
{% endhighlight %}

Now, the html:

{% highlight html %}
<ul>
  <li class="mySelector">Item 1</li>
  <li class="mySelector">Item 2</li>
  <li class="mySelector">Item 3</li>
</ul>
{% endhighlight %}

So, now when any one of those elements is clicked, the function will fire. Great! It works. But here's the catch - what if this list was actually a todo list, and each element in the list was either added or removed dynamically? Let's look at the code for this.

Javascript:

{% highlight javascript %}
var addItem = function(){
  $('ul').append("<li class=\"mySelector\">Item 4</li>");
};
{% endhighlight %}

This function is nothing special, it merely appends a new item to the todo list. For the sake of this example, let's just say we only call it once and only add one item to our 3 item list.

Resulting html code after the addItem function is fired:

{% highlight html %}
<ul>
  <li class="mySelector">Item 1</li>
  <li class="mySelector">Item 2</li>
  <li class="mySelector">Item 3</li>
  <li class="mySelector">Item 4</li>
</ul>
{% endhighlight %}

You might be thinking to yourself, "great, we have a working todo list now!" Not so fast. If you click on items 1 through 3 in your list, you'll still fire the click event logging "You clicked an item" to the console. But, here's the twist. If you click item 4, nothing happens. Uhhhhh...what? Let's take a closer look at what's going on here.

Your initial html code was this:

{% highlight html %}
<ul>
  <li class="mySelector">Item 1</li>
  <li class="mySelector">Item 2</li>
  <li class="mySelector">Item 3</li>
</ul>
{% endhighlight %}

This is what the code looked like when you first loaded the page, thus everything was loaded into the DOM (Document Object Model). Once a page is loaded, that's it, the DOM is set and everything in it is all javascript has to go off of.

With that being said, when we ran our addItem function, the resulting code on the page was

{% highlight html %}
<ul>
  <li class="mySelector">Item 1</li>
  <li class="mySelector">Item 2</li>
  <li class="mySelector">Item 3</li>
  <li class="mySelector">Item 4</li>
</ul>
{% endhighlight %}

But, the code in the DOM was

{% highlight html %}
<ul>
  <li class="mySelector">Item 1</li>
  <li class="mySelector">Item 2</li>
  <li class="mySelector">Item 3</li>
</ul>
{% endhighlight %}

Meaning javascript didn't reload everything after the new call. It should't have to. In order to fix this, we need to add <em>event listeners</em> to the <em>parent</em> element of this application. If we keep trying to listen on the child elements, nothing will happen because those child elements are continuously being added and removed as we use our app!

So, lets change up our original event listener to start listening for click. This time, we're going to pass in a couple different selectors to make things a bit easier.

The javascript:

{% highlight javascript %}
$('ul').on('click', '.mySelector', function(){
  console.log("You clicked mySelector");
});
{% endhighlight %}

Now, we have a working app. What the code above does is listen for clicks on the <em>parent</em> element of the list you want to add to. Since that element will <em>always</em> be in the DOM, you will always hear when the clicks happen. Once it hears a click, it moves down to see if what you clicked on has a class of "mySelector," if it does, your function runs. If it doesn't, nothing happens.

There you have it, folks. A simple explanation of event delegation in javascript. It's important to keep these things in mind when developing on the front end. Having a clear understanding of what's going on and <em>how</em> things work will keep you from spending too much time debugging crap like this (I spent hours debugging this same example a couple years ago).
