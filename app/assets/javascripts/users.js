$(document).on('submit', '#update_bio',function(e) {
  e.preventDefault();

  var path = $('#update_bio').attr('action')
  var text = $('textarea').val()
  console.log(text)
  console.log(path)
  console.log('ajax request from uers.js file to update bio.');
  var request = $.ajax({
                  url: path,
                  type: "PUT",
                  data: {bio: text}
                  });

  request.done(function(data) {
      console.log(data);
      console.log("bio successfully updated via ajax");
      $('#omniModal').modal('hide')
      location.reload();
  });

})
