var html = `<div class="pagingBar_wrapper" url="/48536908/album/4264862" theme="hashlink"> <a href='javascript:;' class='pagingBar_page on'>1</a> <a href='/48536908/album/4264862?page=2' data-page='2' class='pagingBar_page'  hashlink='' unencode>2</a> <a href='/48536908/album/4264862?page=3' data-page='3' class='pagingBar_page'  hashlink='' unencode>3</a> <a href='/48536908/album/4264862?page=2' data-page='2' class='pagingBar_page' hashlink='' unencode rel='next'>下一页</a></div>`;
var pagesRe =/<a[^>]*?class='pagingBar_page'[^>]*?>(\d+)<\/a>/g; 
var page;
while((page = pagesRe.exec(html)) != null){
  console.log(page.length)
}
// var lastPage = pages.splice(-1,1);
// lastPage = pagesRe.exec(lastPage);
// console.log(pages)
